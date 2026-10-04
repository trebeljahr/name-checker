import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PassportPlatform, Reservation, ReservationFailureCode, ReservationStatus } from "@starter/shared";
import { getDb } from "./db";

// Do not import legacy JSON: its user IDs were attacker-controlled cookies.
function database() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS passport_reservations (
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      query TEXT NOT NULL, platform TEXT NOT NULL, payload TEXT NOT NULL,
      PRIMARY KEY (user_id, query, platform)
    );
    CREATE TABLE IF NOT EXISTS passport_oauth (
      state TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      query TEXT NOT NULL, platform TEXT NOT NULL, redirect_uri TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS passport_attempts (
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      query TEXT NOT NULL, platform TEXT NOT NULL, attempt_id TEXT NOT NULL,
      stage TEXT NOT NULL, expires_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, query, platform)
    );
  `);
  return db;
}

type Attempt = { attempt_id: string; stage: AttemptStage; expires_at: number };
// oauth: waiting for the provider redirect; claimed: owned, no external mutation yet;
// external: a provider mutation may have happened, so expiry never permits a retry.
type AttemptStage = "oauth" | "claimed" | "external";
export type AttemptRef = { userId: string; query: string; platform: PassportPlatform; attemptId: string };
export type AttemptConflict = "already_reserved" | "in_progress" | "outcome_uncertain";

export const ATTEMPT_LEASE_MS = 120_000;
const OAUTH_TTL_MS = 600_000;
const KEY = "user_id = ? AND query = ? AND platform = ?";

export class PassportAttemptError extends Error {
  constructor(readonly conflict: AttemptConflict | "superseded") {
    super(`passport attempt ${conflict}`);
    this.name = "PassportAttemptError";
  }
}

function readAttempt(userId: string, query: string, platform: string): Attempt | undefined {
  return database().prepare(`SELECT attempt_id, stage, expires_at FROM passport_attempts WHERE ${KEY}`)
    .get(userId, query, platform) as Attempt | undefined;
}

function readStored(userId: string, query: string, platform: string): Reservation | null {
  const row = database().prepare(`SELECT payload FROM passport_reservations WHERE ${KEY}`)
    .get(userId, query, platform) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) as Reservation : null;
}

// Reads show an abandoned attempt instead of a stale in-progress status.
function present(reservation: Reservation): Reservation {
  const attempt = readAttempt(reservation.userId, reservation.query, reservation.platform);
  if (!attempt || attempt.expires_at > Date.now()) return reservation;
  if (attempt.stage === "external") {
    return { ...reservation, status: "failed", failureCode: "unknown",
      failureDetail: "outcome unknown: the provider may have created it. Check the provider before retrying; support must clear this hold." };
  }
  if (reservation.status === "connecting" || reservation.status === "reserving") {
    return { ...reservation, status: "failed", failureCode: "network_error",
      failureDetail: "interrupted before the provider was changed; retry" };
  }
  return reservation;
}

export async function listReservations(userId: string): Promise<Reservation[]> {
  const rows = database().prepare("SELECT payload FROM passport_reservations WHERE user_id = ?").all(userId) as { payload: string }[];
  return rows.map(row => present(JSON.parse(row.payload) as Reservation));
}

export async function getReservation(userId: string, query: string, platform: PassportPlatform): Promise<Reservation | null> {
  const stored = readStored(userId, query, platform);
  return stored ? present(stored) : null;
}

function writeReservation(patch: Omit<Reservation, "createdAt" | "updatedAt">): Reservation {
  const previous = readStored(patch.userId, patch.query, patch.platform);
  const now = new Date().toISOString();
  const merged: Reservation = { ...patch, createdAt: previous?.createdAt ?? now, updatedAt: now };
  database().prepare(`INSERT INTO passport_reservations VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, query, platform) DO UPDATE SET payload = excluded.payload`)
    .run(patch.userId, patch.query, patch.platform, JSON.stringify(merged));
  return merged;
}

type StatusPatch = {
  userId: string;
  query: string;
  platform: PassportPlatform;
  status: ReservationStatus;
  externalId?: string | null;
  url?: string | null;
  fallbackUrl?: string | null;
  failureCode?: ReservationFailureCode | null;
  failureDetail?: string | null;
};

function applyStatus(opts: StatusPatch): Reservation {
  const existing = readStored(opts.userId, opts.query, opts.platform);
  return writeReservation({
    userId: opts.userId,
    query: opts.query,
    platform: opts.platform,
    status: opts.status,
    externalId: opts.externalId ?? existing?.externalId ?? null,
    url: opts.url ?? existing?.url ?? null,
    fallbackUrl: opts.fallbackUrl ?? existing?.fallbackUrl ?? null,
    failureCode: opts.failureCode ?? null,
    failureDetail: opts.failureDetail ?? null,
  });
}

function blocks(attempt: Attempt | undefined): boolean {
  return Boolean(attempt && (attempt.stage === "external" || (attempt.stage !== "oauth" && attempt.expires_at > Date.now())));
}

// Status written outside an attempt, such as validation failures and soft fallbacks.
// It never overwrites a reservation or an attempt that owns the row.
export async function setStatus(opts: StatusPatch): Promise<Reservation> {
  const db = database();
  return db.transaction(() => {
    const existing = readStored(opts.userId, opts.query, opts.platform);
    if (existing?.status === "reserved" || blocks(readAttempt(opts.userId, opts.query, opts.platform))) {
      return existing ? present(existing) : applyStatus(opts);
    }
    db.prepare(`DELETE FROM passport_attempts WHERE ${KEY}`).run(opts.userId, opts.query, opts.platform);
    return applyStatus(opts);
  }).immediate();
}

// Claims the row for one mutation. A completed reservation, a live owner or an
// unresolved external call blocks a new attempt; a pending OAuth redirect does not.
export function beginAttempt(opts: {
  userId: string; query: string; platform: PassportPlatform;
  stage: "oauth" | "claimed"; attemptId?: string;
}): AttemptRef {
  const db = database();
  return db.transaction(() => {
    const { userId, query, platform } = opts;
    if (readStored(userId, query, platform)?.status === "reserved") throw new PassportAttemptError("already_reserved");
    const current = readAttempt(userId, query, platform);
    if (current?.stage === "external") {
      throw new PassportAttemptError(current.expires_at > Date.now() ? "in_progress" : "outcome_uncertain");
    }
    if (blocks(current)) throw new PassportAttemptError("in_progress");
    const attemptId = opts.attemptId ?? randomUUID();
    const ttl = opts.stage === "oauth" ? OAUTH_TTL_MS : ATTEMPT_LEASE_MS;
    db.prepare(`INSERT INTO passport_attempts VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, query, platform) DO UPDATE SET attempt_id = excluded.attempt_id,
      stage = excluded.stage, expires_at = excluded.expires_at`)
      .run(userId, query, platform, attemptId, opts.stage, Date.now() + ttl);
    applyStatus({ userId, query, platform, status: opts.stage === "oauth" ? "connecting" : "reserving" });
    return { userId, query, platform, attemptId };
  }).immediate();
}

// Recorded before any provider mutation. Only the live owner may cross this line.
export function markExternal(ref: AttemptRef): void {
  const result = database().prepare(`UPDATE passport_attempts SET stage = 'external', expires_at = ?
    WHERE ${KEY} AND attempt_id = ? AND stage = 'claimed' AND expires_at > ?`)
    .run(Date.now() + ATTEMPT_LEASE_MS, ref.userId, ref.query, ref.platform, ref.attemptId, Date.now());
  if (result.changes !== 1) throw new PassportAttemptError("superseded");
}

// The owner's outcome is final. A late external result still resolves its own hold,
// because no successor can replace an external attempt.
export function finishAttempt(ref: AttemptRef, patch: Omit<StatusPatch, "userId" | "query" | "platform">): Reservation {
  const db = database();
  return db.transaction(() => {
    const removed = db.prepare(`DELETE FROM passport_attempts WHERE ${KEY} AND attempt_id = ?
      AND (stage = 'external' OR expires_at > ?)`)
      .run(ref.userId, ref.query, ref.platform, ref.attemptId, Date.now());
    if (removed.changes !== 1) throw new PassportAttemptError("superseded");
    return applyStatus({ ...patch, userId: ref.userId, query: ref.query, platform: ref.platform });
  }).immediate();
}

export function oauthAttemptId(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

type OAuthSession = { userId: string; query: string; platform: PassportPlatform; redirectUri: string };

export async function createOAuthSession(opts: OAuthSession): Promise<string> {
  const db = database();
  const state = randomBytes(32).toString("hex");
  db.prepare("DELETE FROM passport_oauth WHERE expires_at <= ?").run(Date.now());
  db.prepare("INSERT INTO passport_oauth VALUES (?, ?, ?, ?, ?, ?)")
    .run(state, opts.userId, opts.query, opts.platform, opts.redirectUri, Date.now() + 600_000);
  return state;
}

// Consumes the single-use state and claims its attempt in one transaction. A crash
// before a provider mutation leaves a claimed attempt that expires into a retry.
export async function consumeOAuthSession(state: string, userId: string, platform: PassportPlatform, redirectUri: string): Promise<(OAuthSession & { attempt: AttemptRef }) | null> {
  const db = database();
  return db.transaction(() => {
    const row = db.prepare(`DELETE FROM passport_oauth
      WHERE state = ? AND user_id = ? AND platform = ? AND redirect_uri = ? AND expires_at > ?
      RETURNING user_id AS userId, query, platform, redirect_uri AS redirectUri`)
      .get(state, userId, platform, redirectUri, Date.now()) as OAuthSession | undefined;
    if (!row) return null;
    const attemptId = oauthAttemptId(state);
    const claimed = db.prepare(`UPDATE passport_attempts SET stage = 'claimed', expires_at = ?
      WHERE ${KEY} AND attempt_id = ? AND stage = 'oauth' AND expires_at > ?`)
      .run(Date.now() + ATTEMPT_LEASE_MS, row.userId, row.query, row.platform, attemptId, Date.now());
    if (claimed.changes !== 1) return null;
    return { ...row, attempt: { userId: row.userId, query: row.query, platform: row.platform, attemptId } };
  }).immediate();
}
