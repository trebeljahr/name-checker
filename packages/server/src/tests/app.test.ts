import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The account database opens when the app module loads (better-auth reads
// it at construction), so the path is set before the dynamic import.
const directory = mkdtempSync(join(tmpdir(), "name-checker-app-"));
const savedEnv = { ...process.env };
process.env.AUTH_DB_PATH = join(directory, "auth.db");
process.env.BETTER_AUTH_URL = "http://127.0.0.1";
process.env.BUILD_COMMIT = "0123456789abcdef0123456789abcdef01234567";

let server: Server;
let origin: string;
let ROUTES: typeof import("../app").ROUTES;

beforeAll(async () => {
  const app = await import("../app");
  ROUTES = app.ROUTES;
  server = createServer(app.createApp());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  const { getDb } = await import("../lib/db");
  getDb().close();
  rmSync(directory, { recursive: true, force: true });
  process.env = savedEnv;
});

it("serves the paths the Next route handlers served", () => {
  // The web client, CLI, MCP server, extension, Stripe and GitHub call these.
  expect(ROUTES.map(([path]) => path)).toEqual([
    "/api/auth/{*rest}",
    "/api/billing/checkout",
    "/api/billing/portal",
    "/api/billing/webhook",
    "/api/check",
    "/api/check/bulk",
    "/api/check/compare",
    "/api/check/jobs",
    "/api/cron/watch",
    "/api/health",
    "/api/me",
    "/api/passport/bluesky",
    "/api/passport/callback/:provider",
    "/api/passport/github",
    "/api/passport/npm",
    "/api/passport/status",
    "/api/variants",
    "/api/watch",
  ]);
});

it("reports health with the database identity and build commit", async () => {
  const res = await fetch(`${origin}/api/health`);
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("x-powered-by")).toBeNull();
  const body = (await res.json()) as Record<string, unknown>;
  expect(body).toMatchObject({
    status: "ok",
    checksProtocol: 1,
    version: "0123456789abcdef0123456789abcdef01234567",
  });
  expect(body.databaseId).toMatch(/^[0-9a-f-]{36}$/);
});

it("answers HEAD and OPTIONS, and 405 for other methods", async () => {
  const head = await fetch(`${origin}/api/health`, { method: "HEAD" });
  expect(head.status).toBe(200);
  const put = await fetch(`${origin}/api/health`, { method: "PUT" });
  expect(put.status).toBe(405);
  expect(put.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  const options = await fetch(`${origin}/api/watch`, { method: "OPTIONS" });
  expect(options.status).toBe(204);
  expect(options.headers.get("allow")).toBe("GET, POST, DELETE, HEAD, OPTIONS");
});

it("answers unknown API paths with JSON 404", async () => {
  const res = await fetch(`${origin}/api/nope`);
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "not_found" });
});

it("routes better-auth under /api/auth", async () => {
  const res = await fetch(`${origin}/api/auth/get-session`);
  expect(res.status).toBe(200);
  expect(await res.json()).toBeNull();
});

it("keeps the anonymous and signed-out answers", async () => {
  expect(await (await fetch(`${origin}/api/me`)).json()).toEqual({ authenticated: false });
  expect((await fetch(`${origin}/api/watch`)).status).toBe(401);
  expect((await fetch(`${origin}/api/passport/status`)).status).toBe(401);
  expect((await fetch(`${origin}/api/passport/callback/github?state=x`)).status).toBe(401);
  expect((await fetch(`${origin}/api/billing/portal`, { method: "POST" })).status).toBe(401);
});

it("lists providers and suggests variants", async () => {
  const providers = (await (await fetch(`${origin}/api/check`)).json()) as {
    providers: Array<{ id: string }>;
  };
  expect(providers.providers.length).toBeGreaterThan(10);
  const variants = (await (await fetch(`${origin}/api/variants?q=acme&n=5`)).json()) as {
    query: string;
    suggestions: string[];
  };
  expect(variants.query).toBe("acme");
  expect(variants.suggestions.length).toBeGreaterThan(0);
});

it("validates check requests", async () => {
  const res = await fetch(`${origin}/api/check`, { method: "POST", body: "not json" });
  expect(res.status).toBe(400);
});

it("reads the Stripe webhook body raw and refuses it unconfigured", async () => {
  const res = await fetch(`${origin}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=x" },
    body: "{}",
  });
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "STRIPE_WEBHOOK_SECRET is not configured" });
});

it("refuses the watch cron without its secret", async () => {
  const res = await fetch(`${origin}/api/cron/watch`);
  expect(res.status).toBe(503);
});
