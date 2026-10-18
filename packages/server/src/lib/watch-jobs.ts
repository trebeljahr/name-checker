import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { CheckSummary, Provider, ProviderResult } from "@starter/shared";
import { rowToWatch, type RawWatchRow, type WatchRow } from "./watch-db";

export const WATCH_LEASE_MS = 10_000;
export const WATCH_RECEIPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export type WatchPhase =
  | "checking"
  | "pending"
  | "sending"
  | "sent"
  | "no_change"
  | "uncertain"
  | "obsolete";
export type WatchMessage = { to: string; subject: string; text: string };
export type WatchRun = {
  id: string;
  watch: WatchRow;
  phase: WatchPhase;
  worker: string | null;
  providers: Pick<Provider, "id" | "name" | "category">[] | null;
  message: Omit<WatchMessage, "to"> | null;
  changed: number;
  reason: string | null;
};
type RawRun = {
  id: string;
  watch_id: string;
  snapshot_json: string;
  phase: WatchPhase;
  worker: string | null;
  lease_until: number;
  providers_json: string | null;
  message_json: string | null;
  changed: number;
  reason: string | null;
};
export class WatchLeaseError extends Error {
  constructor() {
    super("watch_lease_lost");
  }
}

export interface WatchJobStore {
  reserveDue(staleMs: number): number;
  runnable(limit?: number): WatchRun[];
  claim(id: string): string | null;
  renew(id: string, worker: string): boolean;
  current(id: string, worker: string): WatchRun;
  providers(id: string, worker: string, list: WatchRun["providers"]): void;
  results(id: string, worker: string): ProviderResult[];
  saveResult(id: string, worker: string, result: ProviderResult): void;
  prepare(
    id: string,
    worker: string,
    summary: CheckSummary,
    message: WatchRun["message"],
    changed: number,
  ): void;
  beginDelivery(id: string, worker: string): WatchMessage | null;
  delivery(
    id: string,
    worker: string,
    outcome: "sent" | "not_sent" | "uncertain",
  ): void;
  release(id: string, worker: string, reason?: string): void;
  inspect(id: string): WatchRun | null;
  heldCount(): number;
}

/** Additive tables; all replicas must share the same local SQLite directory/WAL. */
export function createWatchJobStore(
  db: Database.Database,
  clock: () => number = Date.now,
): WatchJobStore {
  db.exec(`
    CREATE TABLE IF NOT EXISTS watch_runs (
      id TEXT PRIMARY KEY, watch_id TEXT NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
      snapshot_json TEXT NOT NULL, phase TEXT NOT NULL DEFAULT 'checking',
      providers_json TEXT, message_json TEXT, recipient TEXT, changed INTEGER NOT NULL DEFAULT 0,
      worker TEXT, lease_until INTEGER NOT NULL DEFAULT 0, reason TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS watch_one_active_run ON watch_runs(watch_id)
      WHERE phase IN ('checking', 'pending', 'sending');
    CREATE INDEX IF NOT EXISTS watch_runs_runnable ON watch_runs(phase, lease_until, created_at);
    CREATE INDEX IF NOT EXISTS watch_runs_retention ON watch_runs(phase, updated_at);
    CREATE TABLE IF NOT EXISTS watch_run_results (
      run_id TEXT NOT NULL REFERENCES watch_runs(id) ON DELETE CASCADE,
      provider_id TEXT NOT NULL, result_json TEXT NOT NULL, PRIMARY KEY(run_id, provider_id)
    );
  `);
  const raw = (id: string): RawRun | undefined =>
    db.prepare("SELECT * FROM watch_runs WHERE id = ?").get(id) as
      | RawRun
      | undefined;
  const decode = (r: RawRun): WatchRun => ({
    id: r.id,
    watch: rowToWatch(JSON.parse(r.snapshot_json) as RawWatchRow),
    phase: r.phase,
    worker: r.worker,
    providers: r.providers_json ? JSON.parse(r.providers_json) : null,
    message: r.message_json ? JSON.parse(r.message_json) : null,
    changed: r.changed,
    reason: r.reason,
  });
  function requireOwner(
    id: string,
    worker: string,
    phase?: WatchPhase,
  ): RawRun {
    const r = raw(id);
    if (
      !r ||
      r.worker !== worker ||
      r.lease_until <= clock() ||
      (phase && r.phase !== phase)
    )
      throw new WatchLeaseError();
    return r;
  }
  function reserveDue(staleMs: number): number {
    const now = clock();
    // One SQLite statement captures the scheduled set without materializing an
    // unbounded JS array. Workers consume only bounded pages of these receipts.
    return Number(
      db
        .prepare(
          `INSERT INTO watch_runs(id, watch_id, snapshot_json, created_at, updated_at)
      SELECT lower(hex(randomblob(16))), w.id,
        json_object('id',w.id,'user_id',w.user_id,'query',w.query,
          'categories_csv',w.categories_csv,'providers_csv',w.providers_csv,
          'created_at',w.created_at,'last_run_at',w.last_run_at,'last_summary_json',w.last_summary_json), ?, ?
      FROM watches w WHERE (w.last_run_at IS NULL OR w.last_run_at < ?)
        AND NOT EXISTS (SELECT 1 FROM watch_runs r WHERE r.watch_id=w.id AND r.phase IN ('checking','pending','sending'))
      `,
        )
        .run(now, now, now - staleMs).changes,
    );
  }
  function runnable(limit = 10): WatchRun[] {
    const now = clock();
    // Bounded deletion also cascades provider checkpoints. Never discard an
    // unresolved intent, even when its lease or retention period has elapsed.
    db.prepare(
      `DELETE FROM watch_runs WHERE id IN (
      SELECT id FROM watch_runs WHERE phase IN ('sent','no_change','obsolete')
      AND updated_at<? ORDER BY updated_at,id LIMIT 100
    )`,
    ).run(now - WATCH_RECEIPT_RETENTION_MS);
    // A dead sender might already have delivered its email. It is never
    // automatically retried, even if the old worker later resumes.
    db.prepare(
      `UPDATE watch_runs SET phase='uncertain', worker=NULL, lease_until=0,
      reason='delivery_outcome_unknown', updated_at=MAX(updated_at+1,?) WHERE phase='sending' AND lease_until<=?`,
    ).run(now, now);
    return (
      db
        .prepare(
          `SELECT * FROM watch_runs WHERE phase IN ('checking','pending')
      AND lease_until<=? ORDER BY updated_at,id LIMIT ?`,
        )
        .all(now, limit) as RawRun[]
    ).map(decode);
  }
  function claim(id: string): string | null {
    const worker = randomUUID(),
      now = clock();
    const result = db
      .prepare(
        `UPDATE watch_runs SET worker=?,lease_until=?,updated_at=MAX(updated_at+1,?)
      WHERE id=? AND phase IN ('checking','pending') AND lease_until<=?`,
      )
      .run(worker, now + WATCH_LEASE_MS, now, id, now);
    return result.changes === 1 ? worker : null;
  }
  function renew(id: string, worker: string): boolean {
    const now = clock();
    return (
      db
        .prepare(
          `UPDATE watch_runs SET lease_until=? WHERE id=? AND worker=? AND lease_until>?
      AND phase IN ('checking','pending','sending')`,
        )
        .run(now + WATCH_LEASE_MS, id, worker, now).changes === 1
    );
  }
  function current(id: string, worker: string): WatchRun {
    return decode(requireOwner(id, worker));
  }
  function providers(
    id: string,
    worker: string,
    list: WatchRun["providers"],
  ): void {
    db.transaction(() => {
      const r = requireOwner(id, worker, "checking");
      if (!r.providers_json)
        db.prepare("UPDATE watch_runs SET providers_json=? WHERE id=?").run(
          JSON.stringify(list),
          id,
        );
    }).immediate();
  }
  function results(id: string, worker: string): ProviderResult[] {
    requireOwner(id, worker, "checking");
    return (
      db
        .prepare("SELECT result_json FROM watch_run_results WHERE run_id=?")
        .all(id) as { result_json: string }[]
    ).map((r) => JSON.parse(r.result_json) as ProviderResult);
  }
  function saveResult(
    id: string,
    worker: string,
    result: ProviderResult,
  ): void {
    db.transaction(() => {
      requireOwner(id, worker, "checking");
      db.prepare(
        "INSERT INTO watch_run_results VALUES (?,?,?) ON CONFLICT(run_id,provider_id) DO NOTHING",
      ).run(id, result.providerId, JSON.stringify(result));
    }).immediate();
  }
  function prepare(
    id: string,
    worker: string,
    summary: CheckSummary,
    message: WatchRun["message"],
    changed: number,
  ): void {
    db.transaction(() => {
      const r = requireOwner(id, worker, "checking");
      const original = JSON.parse(r.snapshot_json) as RawWatchRow;
      const now = clock();
      const written = db
        .prepare(
          `UPDATE watches SET last_run_at=?,last_summary_json=? WHERE id=?
        AND last_run_at IS ? AND last_summary_json IS ?`,
        )
        .run(
          now,
          JSON.stringify(summary),
          r.watch_id,
          original.last_run_at,
          original.last_summary_json,
        );
      if (written.changes !== 1) {
        db.prepare(
          "UPDATE watch_runs SET phase='obsolete',worker=NULL,lease_until=0,reason='watch_changed',updated_at=MAX(updated_at+1,?) WHERE id=?",
        ).run(now, id);
        return;
      }
      // Summary and notification intent are the same transaction. A crash
      // cannot consume a diff while losing its pending email.
      db.prepare(
        `UPDATE watch_runs SET phase=?,message_json=?,changed=?,reason=NULL,updated_at=MAX(updated_at+1,?) WHERE id=?`,
      ).run(
        message ? "pending" : "no_change",
        message ? JSON.stringify(message) : null,
        changed,
        now,
        id,
      );
    }).immediate();
  }
  function beginDelivery(id: string, worker: string): WatchMessage | null {
    return db
      .transaction(() => {
        const r = requireOwner(id, worker, "pending");
        const recipient = db
          .prepare(
            `SELECT u.email FROM watches w JOIN "user" u ON u.id=w.user_id WHERE w.id=?`,
          )
          .get(r.watch_id) as { email: string } | undefined;
        if (!recipient?.email) {
          db.prepare(
            "UPDATE watch_runs SET reason='no_recipient' WHERE id=?",
          ).run(id);
          return null;
        }
        db.prepare(
          "UPDATE watch_runs SET phase='sending',recipient=?,reason=NULL,updated_at=MAX(updated_at+1,?) WHERE id=?",
        ).run(recipient.email, clock(), id);
        return {
          ...JSON.parse(r.message_json!),
          to: recipient.email,
        } as WatchMessage;
      })
      .immediate();
  }
  function delivery(
    id: string,
    worker: string,
    outcome: "sent" | "not_sent" | "uncertain",
  ): void {
    db.transaction(() => {
      requireOwner(id, worker, "sending");
      db.prepare(
        `UPDATE watch_runs SET phase=?,reason=?,worker=NULL,lease_until=0,updated_at=MAX(updated_at+1,?) WHERE id=?`,
      ).run(
        outcome === "not_sent" ? "pending" : outcome,
        outcome === "not_sent"
          ? "delivery_not_started"
          : outcome === "uncertain"
            ? "delivery_outcome_unknown"
            : null,
        clock(),
        id,
      );
    }).immediate();
  }
  function release(id: string, worker: string, reason?: string): void {
    // Never turn a sending row into pending here: a process can stop at any
    // point after the external send starts. Expiration moves it to uncertain.
    db.prepare(
      `UPDATE watch_runs SET worker=NULL,lease_until=0,reason=COALESCE(?,reason),updated_at=MAX(updated_at+1,?)
      WHERE id=? AND worker=? AND phase!='sending'`,
    ).run(reason ?? null, clock(), id, worker);
  }
  function inspect(id: string): WatchRun | null {
    const r = raw(id);
    return r ? decode(r) : null;
  }
  function heldCount(): number {
    return (
      db
        .prepare("SELECT count(*) AS n FROM watch_runs WHERE phase='uncertain'")
        .get() as { n: number }
    ).n;
  }
  return {
    reserveDue,
    runnable,
    claim,
    renew,
    current,
    providers,
    results,
    saveResult,
    prepare,
    beginDelivery,
    delivery,
    release,
    inspect,
    heldCount,
  };
}
