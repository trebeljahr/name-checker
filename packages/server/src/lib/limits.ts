import {
  BULK_NAMES_PER_RUN,
  BULK_RUNS_PER_DAY,
  PASSPORT_STARTS_PER_DAY,
} from "@starter/shared/limits";
import { getDb } from "./db";

export {
  BULK_NAMES_PER_RUN,
  BULK_RUNS_PER_DAY,
  PASSPORT_STARTS_PER_DAY,
} from "@starter/shared/limits";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getRunsToday(userId: string): number {
  const row = getDb()
    .prepare<[string, string], { runs: number }>(
      "SELECT runs FROM usage_log WHERE user_id = ? AND day = ?",
    )
    .get(userId, today());
  return row?.runs ?? 0;
}

export function recordRun(userId: string): void {
  getDb()
    .prepare(
      `INSERT INTO usage_log (user_id, day, runs) VALUES (?, ?, 1)
       ON CONFLICT(user_id, day) DO UPDATE SET runs = runs + 1`,
    )
    .run(userId, today());
}

export type LimitCheck =
  | { ok: true }
  | { ok: false; status: 400 | 429; body: Record<string, unknown> };

export function enforceBulkLimits(userId: string, nameCount: number): LimitCheck {
  if (nameCount > BULK_NAMES_PER_RUN) {
    return {
      ok: false,
      status: 400,
      body: { error: "bulk_limit_size", limit: BULK_NAMES_PER_RUN },
    };
  }
  if (getRunsToday(userId) >= BULK_RUNS_PER_DAY) {
    return {
      ok: false,
      status: 429,
      body: { error: "bulk_limit_runs", limit: BULK_RUNS_PER_DAY },
    };
  }
  return { ok: true };
}

/**
 * Counts one Passport reservation start for today and says whether it fits
 * the daily limit. Call it right before an attempt begins, so validation
 * failures and missing credentials cost nothing.
 */
export function takePassportStart(userId: string): LimitCheck {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS passport_daily_starts (
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    day TEXT NOT NULL, starts INTEGER NOT NULL,
    PRIMARY KEY (user_id, day)
  )`);
  const day = today();
  return db
    .transaction((): LimitCheck => {
      const row = db
        .prepare<[string, string], { starts: number }>(
          "SELECT starts FROM passport_daily_starts WHERE user_id = ? AND day = ?",
        )
        .get(userId, day);
      if ((row?.starts ?? 0) >= PASSPORT_STARTS_PER_DAY) {
        return {
          ok: false,
          status: 429,
          body: {
            error: "passport_limit",
            detail: `You can start ${PASSPORT_STARTS_PER_DAY} reservations per day. Try again tomorrow.`,
            limit: PASSPORT_STARTS_PER_DAY,
          },
        };
      }
      db.prepare(
        `INSERT INTO passport_daily_starts (user_id, day, starts) VALUES (?, ?, 1)
         ON CONFLICT(user_id, day) DO UPDATE SET starts = starts + 1`,
      ).run(userId, day);
      return { ok: true };
    })
    .immediate();
}
