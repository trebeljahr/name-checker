import { randomBytes } from "node:crypto";
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
  `);
  return db;
}

export async function listReservations(userId: string): Promise<Reservation[]> {
  const rows = database().prepare("SELECT payload FROM passport_reservations WHERE user_id = ?").all(userId) as { payload: string }[];
  return rows.map(row => JSON.parse(row.payload) as Reservation);
}

export async function getReservation(userId: string, query: string, platform: PassportPlatform): Promise<Reservation | null> {
  const row = database().prepare("SELECT payload FROM passport_reservations WHERE user_id = ? AND query = ? AND platform = ?").get(userId, query, platform) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) as Reservation : null;
}

export async function upsertReservation(patch: Omit<Reservation, "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string }): Promise<Reservation> {
  const db = database();
  return db.transaction(() => {
    const row = db.prepare("SELECT payload FROM passport_reservations WHERE user_id = ? AND query = ? AND platform = ?").get(patch.userId, patch.query, patch.platform) as { payload: string } | undefined;
    const previous = row ? JSON.parse(row.payload) as Reservation : null;
    const now = new Date().toISOString();
    const merged: Reservation = { ...patch, createdAt: previous?.createdAt ?? now, updatedAt: now };
    db.prepare(`INSERT INTO passport_reservations VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, query, platform) DO UPDATE SET payload = excluded.payload`)
      .run(patch.userId, patch.query, patch.platform, JSON.stringify(merged));
    return merged;
  })();
}

export async function setStatus(opts: {
  userId: string;
  query: string;
  platform: PassportPlatform;
  status: ReservationStatus;
  externalId?: string | null;
  url?: string | null;
  fallbackUrl?: string | null;
  failureCode?: ReservationFailureCode | null;
  failureDetail?: string | null;
}): Promise<Reservation> {
  const existing = await getReservation(opts.userId, opts.query, opts.platform);
  return upsertReservation({
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

type OAuthSession = { userId: string; query: string; platform: PassportPlatform; redirectUri: string };

export async function createOAuthSession(opts: OAuthSession): Promise<string> {
  const db = database();
  const state = randomBytes(32).toString("hex");
  db.prepare("DELETE FROM passport_oauth WHERE expires_at <= ?").run(Date.now());
  db.prepare("INSERT INTO passport_oauth VALUES (?, ?, ?, ?, ?, ?)")
    .run(state, opts.userId, opts.query, opts.platform, opts.redirectUri, Date.now() + 600_000);
  return state;
}

export async function consumeOAuthSession(state: string, userId: string, platform: PassportPlatform, redirectUri: string): Promise<OAuthSession | null> {
  // One SQL statement claims state across concurrent requests and processes.
  const row = database().prepare(`DELETE FROM passport_oauth
    WHERE state = ? AND user_id = ? AND platform = ? AND redirect_uri = ? AND expires_at > ?
    RETURNING user_id AS userId, query, platform, redirect_uri AS redirectUri`)
    .get(state, userId, platform, redirectUri, Date.now()) as OAuthSession | undefined;
  return row ?? null;
}
