import { randomUUID } from "node:crypto";
import type { CheckSummary, ProviderCategory } from "@starter/shared";
import { getDb } from "./db";

export type WatchRow = {
  id: string;
  userId: string;
  query: string;
  categories: ProviderCategory[] | null;
  providers: string[] | null;
  createdAt: number;
  lastRunAt: number | null;
  lastSummary: CheckSummary | null;
};

type RawWatchRow = {
  id: string;
  user_id: string;
  query: string;
  categories_csv: string | null;
  providers_csv: string | null;
  created_at: number;
  last_run_at: number | null;
  last_summary_json: string | null;
};

function fromCsv<T extends string>(csv: string | null): T[] | null {
  if (!csv) return null;
  const parts = csv.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? (parts as T[]) : null;
}

function toCsv(list: readonly string[] | null | undefined): string | null {
  if (!list || list.length === 0) return null;
  return list.join(",");
}

function rowToWatch(r: RawWatchRow): WatchRow {
  let summary: CheckSummary | null = null;
  if (r.last_summary_json) {
    try {
      summary = JSON.parse(r.last_summary_json) as CheckSummary;
    } catch {
      summary = null;
    }
  }
  return {
    id: r.id,
    userId: r.user_id,
    query: r.query,
    categories: fromCsv<ProviderCategory>(r.categories_csv),
    providers: fromCsv(r.providers_csv),
    createdAt: r.created_at,
    lastRunAt: r.last_run_at,
    lastSummary: summary,
  };
}

export type InsertWatchInput = {
  userId: string;
  query: string;
  categories?: ProviderCategory[];
  providers?: string[];
  summary: CheckSummary;
};

export function insertWatch(input: InsertWatchInput): WatchRow {
  const db = getDb();
  const now = Date.now();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO watches (id, user_id, query, categories_csv, providers_csv, created_at, last_run_at, last_summary_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.userId,
    input.query,
    toCsv(input.categories),
    toCsv(input.providers),
    now,
    now,
    JSON.stringify(input.summary),
  );
  return {
    id,
    userId: input.userId,
    query: input.query,
    categories: input.categories ?? null,
    providers: input.providers ?? null,
    createdAt: now,
    lastRunAt: now,
    lastSummary: input.summary,
  };
}

export function listWatches(userId: string): WatchRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM watches WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as RawWatchRow[];
  return rows.map(rowToWatch);
}

export function getWatch(id: string, userId: string): WatchRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM watches WHERE id = ? AND user_id = ?`)
    .get(id, userId) as RawWatchRow | undefined;
  return row ? rowToWatch(row) : null;
}

export function findWatchByQuery(
  userId: string,
  query: string,
): WatchRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM watches WHERE user_id = ? AND query = ? LIMIT 1`)
    .get(userId, query) as RawWatchRow | undefined;
  return row ? rowToWatch(row) : null;
}

export function deleteWatch(id: string, userId: string): boolean {
  const info = getDb()
    .prepare(`DELETE FROM watches WHERE id = ? AND user_id = ?`)
    .run(id, userId);
  return Number(info.changes) > 0;
}

export function listStaleWatches(olderThanMs: number): WatchRow[] {
  const cutoff = Date.now() - olderThanMs;
  const rows = getDb()
    .prepare(
      `SELECT * FROM watches WHERE last_run_at IS NULL OR last_run_at < ?`,
    )
    .all(cutoff) as RawWatchRow[];
  return rows.map(rowToWatch);
}

export function updateWatchSummary(id: string, summary: CheckSummary): void {
  getDb()
    .prepare(
      `UPDATE watches SET last_run_at = ?, last_summary_json = ? WHERE id = ?`,
    )
    .run(Date.now(), JSON.stringify(summary), id);
}

export function getUserEmail(userId: string): string | null {
  const row = getDb()
    .prepare(`SELECT email FROM "user" WHERE id = ?`)
    .get(userId) as { email: string } | undefined;
  return row?.email ?? null;
}
