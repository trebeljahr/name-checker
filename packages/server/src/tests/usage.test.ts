import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

// This database is in memory; no dotenv files, live auth or providers.
vi.mock("../lib/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(":memory:");
  return { getDb: () => db };
});

import { getDb } from "../lib/db";
import { createProviderCallCounter } from "../lib/provider-calls";
import { GET } from "../routes/usage";

const day = 86_400_000;
const start = Date.parse("2026-10-20T12:00:00Z");

function usage(authorization?: string, query = ""): Promise<Response> {
  return GET(
    new Request(`https://app.test/api/usage${query}`, {
      headers: authorization ? { authorization } : {},
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("USAGE_REPORT_TOKEN", "fixture-token");
  getDb().exec("DROP TABLE IF EXISTS provider_calls");
});
afterAll(() => {
  vi.unstubAllEnvs();
  getDb().close();
});

describe("provider call counter", () => {
  it("counts calls per provider and UTC day", () => {
    let now = start;
    const counter = createProviderCallCounter(new Database(":memory:"), () => now);
    counter.record("npm");
    counter.record("npm");
    counter.record("tmview");
    now += day;
    counter.record("tmview");
    expect(counter.report(30)).toEqual([
      { day: "2026-10-21", total: 1, providers: { tmview: 1 } },
      { day: "2026-10-20", total: 3, providers: { npm: 2, tmview: 1 } },
    ]);
    expect(counter.report(1)).toEqual([
      { day: "2026-10-21", total: 1, providers: { tmview: 1 } },
    ]);
  });

  it("loses a count, not the check, when the database is closed", () => {
    const db = new Database(":memory:");
    const counter = createProviderCallCounter(db);
    db.close();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => counter.record("npm")).not.toThrow();
    expect(() => counter.record("npm")).not.toThrow();
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});

describe("GET /api/usage", () => {
  it("stays closed without a configured token", async () => {
    vi.stubEnv("USAGE_REPORT_TOKEN", "");
    expect((await usage("Bearer ")).status).toBe(503);
  });

  it("rejects a missing or wrong token", async () => {
    expect((await usage()).status).toBe(401);
    expect((await usage("Bearer wrong")).status).toBe(401);
  });

  it("returns the daily counts to the operator", async () => {
    const counter = createProviderCallCounter(getDb());
    counter.record("npm");
    counter.record("npm");
    const res = await usage("Bearer fixture-token", "?days=7");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { days: { total: number; providers: Record<string, number> }[] };
    expect(body.days).toHaveLength(1);
    expect(body.days[0]).toMatchObject({ total: 2, providers: { npm: 2 } });
  });
});
