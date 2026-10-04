import { afterAll, afterEach, expect, it, vi } from "vitest";

vi.mock("../lib/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(":memory:");
  db.exec(
    "CREATE TABLE user(id TEXT PRIMARY KEY); CREATE TABLE usage_log(user_id TEXT, day TEXT, runs INTEGER, PRIMARY KEY(user_id,day));",
  );
  return { getDb: () => db };
});
import { getDb } from "../lib/db";
import { GET } from "../app/api/health/route";

afterEach(() => {
  getDb().pragma("query_only=OFF");
  vi.unstubAllEnvs();
});
afterAll(() => getDb().close());
it("requires writable durable state rather than a rendered page", async () => {
  expect((await GET()).status).toBe(200);
  getDb().pragma("query_only=ON");
  expect((await GET()).status).toBe(503);
});
it("does not mark a production replica ready without authentication configuration", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BETTER_AUTH_URL", "https://fixture.invalid");
  vi.stubEnv("BETTER_AUTH_SECRET", "");
  expect((await GET()).status).toBe(503);
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "fixture-secret-for-local-readiness-test-only",
  );
  expect((await GET()).status).toBe(200);
});
