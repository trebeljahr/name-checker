import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), sendMail: vi.fn() }));
vi.mock("../lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@starter/shared/passport/npm", () => ({
  createNpmScopeReservation: vi.fn(async () => ({ ok: true, externalId: "fake", url: "https://example.test" })),
  emptyPlaceholderTarball: () => Buffer.from("fake"), npmScope: (q: string) => q,
}));
vi.mock("@starter/shared/passport/github", () => ({
  githubAuthorizeUrl: ({ state, redirectUri }: { state: string; redirectUri: string }) => `https://github.test?state=${state}&redirect_uri=${redirectUri}`,
  githubSoftFallbackUrl: () => "https://github.test/fallback",
  exchangeGithubCode: vi.fn(async () => ({ accessToken: "fake-token" })),
  createGithubOrg: vi.fn(async () => ({ ok: true, externalId: "fake", url: "https://example.test" })),
}));
vi.mock("@starter/shared/passport/bluesky", () => ({
  blueskyFullHandle: (q: string) => q, generateBlueskyPassword: () => "fake-password",
  createBlueskyAccount: vi.fn(async () => ({ ok: true, externalId: "fake", url: "https://example.test" })),
}));

// This database is in memory; no dotenv files, live auth, credentials or providers.
process.env.AUTH_DB_PATH = "/dev/null";
vi.mock("../lib/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE user (id TEXT PRIMARY KEY);
    INSERT INTO user VALUES ('alice'), ('bob');
    CREATE TABLE subscriptions (user_id TEXT PRIMARY KEY, plan TEXT, current_period_end TEXT);`);
  return { getDb: () => db };
});

import { getDb } from "../lib/db";
import { readPassportSession } from "../lib/passport-session";
import { getUserPlan } from "../lib/plan";
import { createOAuthSession, consumeOAuthSession, setStatus, listReservations } from "../lib/passport-store";
import { POST as npm } from "../app/api/passport/npm/route";
import { POST as github } from "../app/api/passport/github/route";
import { POST as bluesky } from "../app/api/passport/bluesky/route";
import { GET as status } from "../app/api/passport/status/route";
import { GET as callback } from "../app/api/passport/callback/[provider]/route";
import { createNpmScopeReservation } from "@starter/shared/passport/npm";
import { exchangeGithubCode } from "@starter/shared/passport/github";

function request(body: object = {}, origin = "https://app.test"): Request {
  return new Request("https://app.test/api/passport/npm", {
    method: "POST", headers: { origin, "content-type": "application/json", cookie: "passport_uid=bob" },
    body: JSON.stringify(body),
  });
}
function signedIn(id = "alice"): void {
  mocks.getSession.mockResolvedValue({ user: { id, email: `${id}@example.test` } });
}
function paid(): void {
  getDb().prepare("INSERT OR REPLACE INTO subscriptions VALUES (?, ?, ?)").run("alice", "pro", new Date(Date.now() + 60_000).toISOString());
}
const context = { params: Promise.resolve({ provider: "github" }) };

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(null);
  vi.stubEnv("PASSPORT_DEFAULT_PLAN", "pro");
  vi.stubEnv("PASSPORT_BYPASS_PLAN", "1");
  vi.stubEnv("PASSPORT_ACTIONS_ENABLED", "1");
  vi.stubEnv("BETTER_AUTH_URL", "https://app.test");
  vi.stubEnv("NPM_TOKEN", "fake-server-token-must-not-be-used");
  vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "fake-id");
  vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "fake-secret");
  getDb().exec("DELETE FROM subscriptions");
  await listReservations("alice");
  getDb().exec("DELETE FROM passport_reservations; DELETE FROM passport_oauth");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ login: "fake" }))));
});
afterAll(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); getDb().close(); });

describe("Passport authorization", () => {
  it("ignores forged legacy cookies and global pro switches", async () => {
    expect(await readPassportSession(request())).toBeNull();
    for (const handler of [npm, github, bluesky]) expect((await handler(request({ query: "name" }))).status).toBe(401);
    expect((await status(request())).status).toBe(401);
    expect((await callback(new Request("https://app.test/api/passport/callback/github?state=forged&code=fake"), context)).status).toBe(401);
    expect(createNpmScopeReservation).not.toHaveBeenCalled();
    expect(exchangeGithubCode).not.toHaveBeenCalled();
  });
  it("rejects unpaid users even with bypass environment enabled", async () => {
    signedIn();
    for (const handler of [npm, github, bluesky]) expect((await handler(request({ query: "name" }))).status).toBe(402);
    expect((await callback(new Request("https://app.test/api/passport/callback/github?state=x&code=x"), context)).status).toBe(402);
  });
  it("fails closed for missing, invalid, and expired billing periods", () => {
    for (const end of [null, "invalid", new Date(Date.now() - 1000).toISOString()]) {
      getDb().prepare("INSERT OR REPLACE INTO subscriptions VALUES ('alice', 'pro', ?)").run(end);
      expect(getUserPlan("alice")).toBe("free");
    }
    paid(); expect(getUserPlan("alice")).toBe("pro");
  });
  it("uses the real identity for reservation reads and writes", async () => {
    signedIn(); paid();
    await setStatus({ userId: "bob", query: "private", platform: "npm", status: "reserved" });
    expect((await (await status(request())).json()).reservations).toEqual([]);
    expect((await npm(request({ query: "mine", token: "fake-user-token", userId: "bob" }))).status).toBe(200);
    expect((await listReservations("alice"))[0]?.query).toBe("mine");
    expect((await listReservations("bob"))[0]?.query).toBe("private");
  });
  it("never falls back to a server npm token", async () => {
    signedIn(); paid();
    expect((await npm(request({ query: "name" }))).status).toBe(400);
    expect(createNpmScopeReservation).not.toHaveBeenCalled();
  });
  it("requires explicit enablement and same-origin mutations", async () => {
    signedIn(); paid();
    vi.stubEnv("PASSPORT_ACTIONS_ENABLED", "0");
    expect((await npm(request({ query: "name", token: "fake" }))).status).toBe(503);
    vi.stubEnv("PASSPORT_ACTIONS_ENABLED", "1");
    expect((await npm(request({}, "https://evil.test"))).status).toBe(403);
    expect((await github(request({ query: "name", redirectOrigin: "https://evil.test" }))).status).toBe(400);
  });
  it("binds OAuth state to identity, provider and exact redirect, and consumes once", async () => {
    const redirectUri = "https://app.test/api/passport/callback/github";
    const state = await createOAuthSession({ userId: "alice", query: "name", platform: "github", redirectUri });
    expect(await consumeOAuthSession(state, "bob", "github", redirectUri)).toBeNull();
    expect(await consumeOAuthSession(state, "alice", "npm", redirectUri)).toBeNull();
    expect(await consumeOAuthSession(state, "alice", "github", "https://evil.test")).toBeNull();
    const results = await Promise.all(Array.from({ length: 10 }, () => consumeOAuthSession(state, "alice", "github", redirectUri)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it("rejects expired state", async () => {
    const redirectUri = "https://app.test/api/passport/callback/github";
    const state = await createOAuthSession({ userId: "alice", query: "name", platform: "github", redirectUri });
    getDb().prepare("UPDATE passport_oauth SET expires_at = 0 WHERE state = ?").run(state);
    expect(await consumeOAuthSession(state, "alice", "github", redirectUri)).toBeNull();
  });
  it("rejects another user's callback and only exchanges once during concurrent callbacks", async () => {
    signedIn(); paid();
    const started = await (await github(request({ query: "name" }))).json();
    const state = new URL(started.authorizeUrl).searchParams.get("state");
    const url = `https://app.test/api/passport/callback/github?state=${state}&code=fake`;
    signedIn("bob");
    getDb().prepare("INSERT INTO subscriptions VALUES ('bob', 'pro', ?)").run(new Date(Date.now() + 60_000).toISOString());
    expect((await callback(new Request(url), context)).status).toBe(400);
    signedIn();
    const results = await Promise.all([callback(new Request(url), context), callback(new Request(url), context)]);
    expect(results.map(r => r.status).sort()).toEqual([302, 400]);
    expect(exchangeGithubCode).toHaveBeenCalledTimes(1);
  });
});
