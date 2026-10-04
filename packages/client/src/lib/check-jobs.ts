import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  FREE_NAMES_PER_REQUEST,
  FREE_RUNS_PER_DAY,
  type Plan,
} from "./plan-constants";

export type CheckKind = "single" | "compare" | "bulk";
export class CheckJobError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}
export type CheckJob = {
  id: string;
  owner: string;
  kind: CheckKind;
  payload: string | null;
  fingerprint: string;
  created_at: number;
  state: "pending" | "running" | "done";
  worker: string | null;
  lease_until: number;
};
export type CheckEvent = { sequence: number; event: string; data: unknown };
type Reservation = {
  id: string;
  owner: string;
  userId?: string;
  kind: CheckKind;
  payload: unknown;
  plan: Plan;
  names: number;
  rateIdentity: string;
  rateLimit: number;
};
export type CheckJobStore = {
  reserve: (input: Reservation) => { job: CheckJob; replay: boolean };
  owned: (id: string, owner: string) => CheckJob;
  claim: (id: string) => string | null;
  renew: (id: string, worker: string) => boolean;
  append: (
    id: string,
    worker: string,
    key: string,
    event: string,
    data: unknown,
    done?: boolean,
  ) => void;
  events: (id: string, owner: string, after?: number) => CheckEvent[];
  saved: (id: string, worker: string, key: string) => unknown | null;
  release: (id: string, worker: string) => void;
};
const LEASE_MS = 5000;
const PAYLOAD_TTL = 7 * 86_400_000;

export function canonicalPayload(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalPayload).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalPayload(v)}`)
    .join(",")}}`;
}

/** One shared local SQLite directory/WAL is required for all overlapping replicas. */
export function createCheckJobStore(
  db: Database.Database,
  clock: () => number = Date.now,
): CheckJobStore {
  db.exec(`
    CREATE TABLE IF NOT EXISTS check_jobs (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, user_id TEXT REFERENCES user(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, fingerprint TEXT NOT NULL, payload TEXT, created_at INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending', worker TEXT, lease_until INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS check_job_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES check_jobs(id) ON DELETE CASCADE,
      event_key TEXT NOT NULL, event TEXT NOT NULL, data TEXT NOT NULL,
      UNIQUE(job_id, event_key)
    );
    CREATE INDEX IF NOT EXISTS check_job_events_job ON check_job_events(job_id, sequence);
    CREATE TABLE IF NOT EXISTS check_request_buckets (
      identity TEXT PRIMARY KEY, reset_at INTEGER NOT NULL, count INTEGER NOT NULL
    );
  `);
  const find = (id: string): CheckJob | undefined =>
    db.prepare("SELECT * FROM check_jobs WHERE id = ?").get(id) as
      | CheckJob
      | undefined;
  function owned(id: string, owner: string): CheckJob {
    const job = find(id);
    if (!job || job.owner !== owner)
      throw new CheckJobError("job_not_found", 404);
    if (job.payload === null || job.created_at + PAYLOAD_TTL <= clock())
      throw new CheckJobError("job_expired", 410);
    return job;
  }
  function reserve(input: Reservation): { job: CheckJob; replay: boolean } {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        input.id,
      )
    )
      throw new CheckJobError("invalid_operation_id", 400);
    if (
      input.owner !== (input.userId ? `user:${input.userId}` : "anonymous") ||
      (input.kind === "bulk" && !input.userId)
    )
      throw new CheckJobError("unauthenticated", 401);
    const payload = canonicalPayload(input.payload);
    const fingerprint = createHash("sha256")
      .update(input.kind + "\n" + payload)
      .digest("hex");
    return db
      .transaction(() => {
        const previous = find(input.id);
        if (previous) {
          const job = owned(input.id, input.owner);
          if (job.fingerprint !== fingerprint || job.kind !== input.kind)
            throw new CheckJobError("operation_payload_mismatch", 409);
          return { job, replay: true };
        }
        const now = clock();
        const identity = createHash("sha256")
          .update(input.rateIdentity)
          .digest("hex");
        db.prepare("DELETE FROM check_request_buckets WHERE reset_at <= ?").run(
          now,
        );
        const bucket = db
          .prepare("SELECT count FROM check_request_buckets WHERE identity = ?")
          .get(identity) as { count: number } | undefined;
        if (bucket && bucket.count >= input.rateLimit)
          throw new CheckJobError("rate_limited", 429);
        if (input.kind === "bulk") {
          if (input.plan !== "pro" && input.names > FREE_NAMES_PER_REQUEST)
            throw new CheckJobError("free_limit_size", 402);
          const day = new Date(now).toISOString().slice(0, 10);
          const usage = db
            .prepare("SELECT runs FROM usage_log WHERE user_id = ? AND day = ?")
            .get(input.userId, day) as { runs: number } | undefined;
          if (input.plan !== "pro" && (usage?.runs ?? 0) >= FREE_RUNS_PER_DAY)
            throw new CheckJobError("free_limit_runs", 402);
          db.prepare(`INSERT INTO usage_log(user_id, day, runs) VALUES (?, ?, 1)
          ON CONFLICT(user_id, day) DO UPDATE SET runs = runs + 1`).run(
            input.userId,
            day,
          );
        }
        db.prepare(`INSERT INTO check_request_buckets VALUES (?, ?, 1)
        ON CONFLICT(identity) DO UPDATE SET count = count + 1`).run(
          identity,
          now + 3_600_000,
        );
        db.prepare(
          "INSERT INTO check_jobs(id, owner, user_id, kind, fingerprint, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).run(
          input.id,
          input.owner,
          input.userId ?? null,
          input.kind,
          fingerprint,
          payload,
          now,
        );
        // Keep the receipt/fingerprint permanently. An expired replay must never
        // become a new quota-consuming operation. User deletion cascades its jobs.
        db.prepare(
          "DELETE FROM check_job_events WHERE job_id IN (SELECT id FROM check_jobs WHERE created_at < ? AND lease_until <= ?)",
        ).run(now - PAYLOAD_TTL, now);
        db.prepare(
          "UPDATE check_jobs SET payload = NULL WHERE created_at < ? AND lease_until <= ?",
        ).run(now - PAYLOAD_TTL, now);
        return { job: owned(input.id, input.owner), replay: false };
      })
      .immediate();
  }
  function claim(id: string): string | null {
    const worker = randomUUID(),
      now = clock();
    const result = db
      .prepare(
        "UPDATE check_jobs SET worker = ?, lease_until = ?, state = 'running' WHERE id = ? AND state != 'done' AND payload IS NOT NULL AND lease_until <= ?",
      )
      .run(worker, now + LEASE_MS, id, now);
    return result.changes === 1 ? worker : null;
  }
  function renew(id: string, worker: string): boolean {
    const now = clock();
    return (
      db
        .prepare(
          "UPDATE check_jobs SET lease_until = ? WHERE id = ? AND worker = ? AND lease_until > ? AND state = 'running'",
        )
        .run(now + LEASE_MS, id, worker, now).changes === 1
    );
  }
  function append(
    id: string,
    worker: string,
    key: string,
    event: string,
    data: unknown,
    done = false,
  ): void {
    db.transaction(() => {
      if (!renew(id, worker)) throw new CheckJobError("job_lease_lost", 409);
      db.prepare(
        "INSERT INTO check_job_events(job_id, event_key, event, data) VALUES (?, ?, ?, ?) ON CONFLICT(job_id, event_key) DO NOTHING",
      ).run(id, key, event, JSON.stringify(data));
      if (done)
        db.prepare(
          "UPDATE check_jobs SET state = 'done', worker = NULL, lease_until = 0 WHERE id = ? AND worker = ?",
        ).run(id, worker);
    }).immediate();
  }
  function events(id: string, owner: string, after = 0): CheckEvent[] {
    owned(id, owner);
    if (!Number.isSafeInteger(after) || after < 0)
      throw new CheckJobError("invalid_event_cursor", 400);
    const rows = db
      .prepare(
        "SELECT sequence, event, data FROM check_job_events WHERE job_id = ? AND sequence > ? ORDER BY sequence LIMIT 200",
      )
      .all(id, after) as { sequence: number; event: string; data: string }[];
    return rows.map((row) => ({ ...row, data: JSON.parse(row.data) }));
  }
  function saved(id: string, worker: string, key: string): unknown | null {
    if (!renew(id, worker)) throw new CheckJobError("job_lease_lost", 409);
    const row = db
      .prepare(
        "SELECT data FROM check_job_events WHERE job_id = ? AND event_key = ?",
      )
      .get(id, key) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }
  function release(id: string, worker: string): void {
    db.prepare(
      "UPDATE check_jobs SET worker = NULL, lease_until = 0, state = 'pending' WHERE id = ? AND worker = ? AND state = 'running'",
    ).run(id, worker);
  }
  return { reserve, owned, claim, renew, append, events, saved, release };
}
