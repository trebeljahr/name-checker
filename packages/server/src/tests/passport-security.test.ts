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
import { beginAttempt, oauthAttemptId, createOAuthSession, consumeOAuthSession, finishAttempt, markExternal, setStatus, listReservations, getReservation } from "../lib/passport-store";
import { POST as npm } from "../routes/passport/npm";
import { POST as github } from "../routes/passport/github";
import { POST as bluesky } from "../routes/passport/bluesky";
import { GET as status } from "../routes/passport/status";
import { GET as callback } from "../routes/passport/callback";
import { createNpmScopeReservation } from "@starter/shared/passport/npm";
import { createGithubOrg, exchangeGithubCode } from "@starter/shared/passport/github";
import { createBlueskyAccount } from "@starter/shared/passport/bluesky";
import { prepareBlueskyPassword, readBlueskyPassword } from "../../../client/src/lib/bluesky-password";

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
  getDb().exec("DELETE FROM passport_reservations; DELETE FROM passport_oauth; DELETE FROM passport_attempts");
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
    beginAttempt({ userId: "alice", query: "name", platform: "github", stage: "oauth", attemptId: oauthAttemptId(state) });
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

function attemptRow(platform = "npm", query = "name") {
  return getDb().prepare("SELECT stage, expires_at FROM passport_attempts WHERE user_id = 'alice' AND query = ? AND platform = ?")
    .get(query, platform) as { stage: string; expires_at: number } | undefined;
}
function expireAttempts(): void {
  getDb().exec("UPDATE passport_attempts SET expires_at = 0");
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function startGithub(query = "name"): Promise<string> {
  const started = await (await github(request({ query }))).json();
  return new URL(started.authorizeUrl).searchParams.get("state")!;
}
function githubCallback(state: string): Promise<Response> {
  return callback(new Request(`https://app.test/api/passport/callback/github?state=${state}&code=fake`), context);
}
type Ok = { ok: true; platform: "npm"; externalId: string; url: string };

describe("Passport mutation recovery", () => {
  beforeEach(() => { signedIn(); paid(); });

  it("serializes concurrent mutations and refuses to repeat a completed reservation", async () => {
    const pending = deferred<Ok>();
    vi.mocked(createNpmScopeReservation).mockReturnValueOnce(pending.promise);
    const first = npm(request({ query: "name", token: "fake" }));
    await vi.waitFor(() => expect(createNpmScopeReservation).toHaveBeenCalledTimes(1));
    expect(attemptRow()?.stage).toBe("external");
    const second = await npm(request({ query: "name", token: "fake" }));
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe("in_progress");
    pending.resolve({ ok: true, platform: "npm", externalId: "fake", url: "https://example.test" });
    expect((await first).status).toBe(200);
    expect(attemptRow()).toBeUndefined();
    expect((await (await npm(request({ query: "name", token: "fake" }))).json()).error).toBe("already_reserved");
    expect(createNpmScopeReservation).toHaveBeenCalledTimes(1);
  });

  it("holds an interrupted provider mutation instead of retrying or overwriting it", async () => {
    // Simulates a process that died after crossing the provider boundary.
    markExternal(beginAttempt({ userId: "alice", query: "name", platform: "npm", stage: "claimed" }));
    expireAttempts();
    const shown = await getReservation("alice", "name", "npm");
    expect(shown).toMatchObject({ status: "failed", failureCode: "unknown" });
    expect(shown?.failureDetail).toMatch(/outcome unknown/);
    const retry = await npm(request({ query: "name", token: "fake" }));
    expect((await retry.json()).error).toBe("outcome_uncertain");
    // A validation failure written outside an attempt does not erase the hold.
    expect((await (await npm(request({ query: "name" }))).json()).reservation.failureCode).toBe("unknown");
    expect(attemptRow()?.stage).toBe("external");
    expect(createNpmScopeReservation).not.toHaveBeenCalled();
  });

  it("lets a late provider result resolve its own hold", async () => {
    const ref = beginAttempt({ userId: "alice", query: "name", platform: "npm", stage: "claimed" });
    markExternal(ref);
    expireAttempts();
    finishAttempt(ref, { status: "reserved", externalId: "late", url: "https://example.test/late" });
    expect(await getReservation("alice", "name", "npm")).toMatchObject({ status: "reserved", externalId: "late" });
  });

  it("fences a superseded owner that never reached the provider", async () => {
    const stale = beginAttempt({ userId: "alice", query: "name", platform: "npm", stage: "claimed" });
    expireAttempts();
    expect((await getReservation("alice", "name", "npm"))?.failureDetail).toMatch(/interrupted before/);
    const fresh = beginAttempt({ userId: "alice", query: "name", platform: "npm", stage: "claimed" });
    expect(() => markExternal(stale)).toThrow("superseded");
    expect(() => finishAttempt(stale, { status: "failed", failureCode: "unknown" })).toThrow("superseded");
    markExternal(fresh);
    finishAttempt(fresh, { status: "reserved", externalId: "fresh", url: "https://example.test" });
    expect((await getReservation("alice", "name", "npm"))?.externalId).toBe("fresh");
  });

  it("requires a browser-held Bluesky password and never returns one", async () => {
    expect((await bluesky(request({ query: "name", email: "a@example.test" }))).status).toBe(400);
    expect((await bluesky(request({ query: "name", email: "a@example.test", password: "short" }))).status).toBe(400);
    expect(createBlueskyAccount).not.toHaveBeenCalled();
    const res = await bluesky(request({ query: "name", email: "a@example.test", password: "fake-browser-password" }));
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty("password");
    expect(vi.mocked(createBlueskyAccount).mock.calls[0][0].password).toBe("fake-browser-password");
  });

  it("saves the generated Bluesky password in the tab before any request and reuses it", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); },
      removeItem: (k: string) => { values.delete(k); },
    } as Storage;
    const password = prepareBlueskyPassword(storage, "name");
    expect(password).toMatch(/^[a-zA-Z0-9]{20}$/);
    expect(readBlueskyPassword(storage, "name")).toBe(password);
    expect(prepareBlueskyPassword(storage, "name")).toBe(password);
    const broken = { ...storage, getItem: () => null, setItem: () => { throw new Error("fake quota"); } } as Storage;
    expect(() => prepareBlueskyPassword(broken, "other")).toThrow();
  });

  it("lets only the newest OAuth redirect claim the attempt and marks the provider boundary", async () => {
    const older = await startGithub();
    const newer = await startGithub();
    expect((await githubCallback(older)).status).toBe(400);
    vi.mocked(createGithubOrg).mockImplementationOnce(async () => {
      expect(attemptRow("github")?.stage).toBe("external");
      return { ok: true, platform: "github", externalId: "fake", url: "https://example.test" };
    });
    const res = await githubCallback(newer);
    expect(res.headers.get("location")).toMatch(/#github=reserved$/);
    expect(exchangeGithubCode).toHaveBeenCalledTimes(1);
    expect(attemptRow("github")).toBeUndefined();
  });

  it("turns a crash after claiming OAuth state into a retryable interruption", async () => {
    const state = await startGithub();
    expect(await consumeOAuthSession(state, "alice", "github", "https://app.test/api/passport/callback/github")).not.toBeNull();
    expireAttempts();
    expect((await getReservation("alice", "name", "github"))?.failureDetail).toMatch(/interrupted before/);
    expect((await github(request({ query: "name" }))).status).toBe(200);
  });

  it("bounds the GitHub user lookup and fails before any organization mutation", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => AbortSignal.abort(new Error("fake timeout")));
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) throw init.signal.reason;
      return new Response(JSON.stringify({ login: "fake" }));
    }));
    try {
      const res = await githubCallback(await startGithub());
      expect(res.headers.get("location")).toMatch(/#github=failed$/);
      expect(timeout).toHaveBeenCalledWith(10_000);
      expect(createGithubOrg).not.toHaveBeenCalled();
      expect(await getReservation("alice", "name", "github")).toMatchObject({ status: "failed", failureCode: "insufficient_perms" });
      expect(attemptRow("github")).toBeUndefined();
    } finally { timeout.mockRestore(); }
  });
});
