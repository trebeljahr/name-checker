import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import type {
  PassportPlatform,
  Reservation,
  ReservationFailureCode,
  ReservationStatus,
} from "@starter/shared";

const STORE_DIR = process.env.PASSPORT_STORE_DIR ?? join(process.cwd(), "data");
const RESERVATIONS_PATH = join(STORE_DIR, "reservations.json");
const SESSIONS_PATH = join(STORE_DIR, "passport-sessions.json");

type ReservationsFile = { reservations: Reservation[] };
type OAuthSession = {
  state: string;
  userId: string;
  query: string;
  platform: PassportPlatform;
  createdAt: string;
};
type SessionsFile = { sessions: OAuthSession[] };

const SESSION_TTL_MS = 10 * 60 * 1000;

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson<T>(path: string, value: T): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

export async function listReservations(userId: string): Promise<Reservation[]> {
  const file = await readJson<ReservationsFile>(RESERVATIONS_PATH, {
    reservations: [],
  });
  return file.reservations.filter((r) => r.userId === userId);
}

export async function getReservation(
  userId: string,
  query: string,
  platform: PassportPlatform,
): Promise<Reservation | null> {
  const all = await listReservations(userId);
  return (
    all.find((r) => r.query === query && r.platform === platform) ?? null
  );
}

export async function upsertReservation(
  patch: Omit<Reservation, "createdAt" | "updatedAt"> & {
    createdAt?: string;
    updatedAt?: string;
  },
): Promise<Reservation> {
  const file = await readJson<ReservationsFile>(RESERVATIONS_PATH, {
    reservations: [],
  });
  const now = new Date().toISOString();
  const idx = file.reservations.findIndex(
    (r) =>
      r.userId === patch.userId &&
      r.query === patch.query &&
      r.platform === patch.platform,
  );
  const merged: Reservation = {
    userId: patch.userId,
    query: patch.query,
    platform: patch.platform,
    status: patch.status,
    externalId: patch.externalId,
    url: patch.url,
    fallbackUrl: patch.fallbackUrl,
    failureCode: patch.failureCode,
    failureDetail: patch.failureDetail,
    createdAt: patch.createdAt ?? file.reservations[idx]?.createdAt ?? now,
    updatedAt: now,
  };
  if (idx === -1) file.reservations.push(merged);
  else file.reservations[idx] = merged;
  await writeJson(RESERVATIONS_PATH, file);
  return merged;
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

export async function createOAuthSession(opts: {
  userId: string;
  query: string;
  platform: PassportPlatform;
}): Promise<string> {
  const state = randomBytes(16).toString("hex");
  const file = await readJson<SessionsFile>(SESSIONS_PATH, { sessions: [] });
  const now = Date.now();
  file.sessions = file.sessions.filter(
    (s) => now - Date.parse(s.createdAt) < SESSION_TTL_MS,
  );
  file.sessions.push({
    state,
    userId: opts.userId,
    query: opts.query,
    platform: opts.platform,
    createdAt: new Date(now).toISOString(),
  });
  await writeJson(SESSIONS_PATH, file);
  return state;
}

export async function consumeOAuthSession(
  state: string,
): Promise<OAuthSession | null> {
  const file = await readJson<SessionsFile>(SESSIONS_PATH, { sessions: [] });
  const now = Date.now();
  const idx = file.sessions.findIndex((s) => s.state === state);
  if (idx === -1) return null;
  const session = file.sessions[idx]!;
  const fresh = now - Date.parse(session.createdAt) < SESSION_TTL_MS;
  file.sessions.splice(idx, 1);
  await writeJson(SESSIONS_PATH, file);
  return fresh ? session : null;
}
