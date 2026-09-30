import { randomUUID } from "node:crypto";
import { getDb } from "./db";

const LEASE_MS = 120_000;

function database() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_locks (
      operation TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS billing_events (
      event_id TEXT PRIMARY KEY, processed_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS billing_customer_requests (
      user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL UNIQUE, email TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `);
  return db;
}

// Cross-process lease. Every write checks ownership inside the same transaction.
// An expired worker cannot overwrite a successor, even if its network call returns late.
export async function withBillingLease<T>(
  operation: string,
  work: (commit: <R>(action: () => R) => R) => Promise<T>,
): Promise<T> {
  const db = database();
  const owner = randomUUID();
  const now = Date.now();
  const acquired = db.prepare(`INSERT INTO billing_locks VALUES (?, ?, ?)
    ON CONFLICT(operation) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
    WHERE billing_locks.expires_at <= ?`).run(operation, owner, now + LEASE_MS, now);
  if (acquired.changes !== 1) throw new Error("Billing operation already in progress");
  const commit = <R>(action: () => R): R => db.transaction(() => {
    const held = db.prepare(`UPDATE billing_locks SET expires_at = ?
      WHERE operation = ? AND owner = ? AND expires_at > ?`)
      .run(Date.now() + LEASE_MS, operation, owner, Date.now());
    if (held.changes !== 1) throw new Error("Billing operation lease expired");
    return action();
  }).immediate();
  try {
    return await work(commit);
  } finally {
    db.prepare("DELETE FROM billing_locks WHERE operation = ? AND owner = ?").run(operation, owner);
  }
}

export function billingEventProcessed(eventId: string): boolean {
  return Boolean(database().prepare("SELECT 1 FROM billing_events WHERE event_id = ?").get(eventId));
}

export function recordBillingEvent(eventId: string): void {
  const db = database();
  db.prepare("INSERT INTO billing_events VALUES (?, ?)").run(eventId, Date.now());
  // A redelivery after retention still reconciles current provider state.
  db.prepare("DELETE FROM billing_events WHERE processed_at < ?").run(Date.now() - 35 * 86_400_000);
}

export function customerRequest(userId: string, email: string): {
  request_id: string; email: string; created_at: number;
} {
  const db = database();
  db.prepare(`INSERT INTO billing_customer_requests VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO NOTHING`).run(userId, randomUUID(), email, Date.now());
  return db.prepare("SELECT request_id, email, created_at FROM billing_customer_requests WHERE user_id = ?")
    .get(userId) as { request_id: string; email: string; created_at: number };
}
