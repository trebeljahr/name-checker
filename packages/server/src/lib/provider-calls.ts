import type Database from "better-sqlite3";

export type UsageDay = {
  day: string;
  total: number;
  /** Calls per provider id, most-called first. */
  providers: Record<string, number>;
};

export type ProviderCallCounter = {
  record: (providerId: string) => void;
  report: (days: number) => UsageDay[];
};

function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Calls to each provider per UTC day, to measure what checks cost before
 * any price exists. A row is a day, a provider id and a count. It holds no
 * name, no account and no address.
 */
export function createProviderCallCounter(
  db: Database.Database,
  clock: () => number = Date.now,
): ProviderCallCounter {
  db.exec(`CREATE TABLE IF NOT EXISTS provider_calls (
    day TEXT NOT NULL, provider_id TEXT NOT NULL, calls INTEGER NOT NULL,
    PRIMARY KEY (day, provider_id)
  )`);
  const add = db.prepare<[string, string]>(
    `INSERT INTO provider_calls (day, provider_id, calls) VALUES (?, ?, 1)
     ON CONFLICT(day, provider_id) DO UPDATE SET calls = calls + 1`,
  );
  const read = db.prepare<
    [string],
    { day: string; provider_id: string; calls: number }
  >(
    `SELECT day, provider_id, calls FROM provider_calls WHERE day >= ?
     ORDER BY day DESC, calls DESC, provider_id`,
  );
  let warned = false;
  return {
    record(providerId) {
      try {
        add.run(dayOf(clock()), providerId);
      } catch (err) {
        // A busy or closed database loses a count, never a check.
        if (!warned) console.error("[usage] could not count a provider call", err);
        warned = true;
      }
    },
    report(days) {
      const since = dayOf(clock() - (days - 1) * 86_400_000);
      const byDay = new Map<string, UsageDay>();
      for (const row of read.all(since)) {
        let entry = byDay.get(row.day);
        if (!entry) {
          entry = { day: row.day, total: 0, providers: {} };
          byDay.set(row.day, entry);
        }
        entry.total += row.calls;
        entry.providers[row.provider_id] = row.calls;
      }
      return [...byDay.values()];
    },
  };
}
