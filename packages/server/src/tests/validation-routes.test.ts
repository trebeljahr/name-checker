// Characterization tests for every server route that validates input with
// zod. They pin the status code and the full JSON body for bad input, and
// the parsed data that good input hands on.
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runCheck: vi.fn(),
  findWatchByQuery: vi.fn(),
  insertWatch: vi.fn(),
}));

vi.mock("../lib/rate-limit-cache", () => ({
  checkRateLimit: () => ({ ok: true }),
  getClientIp: () => "127.0.0.1",
  cacheKey: (input: unknown) => JSON.stringify(input),
}));
vi.mock("../lib/session", () => ({
  getSessionFromRequest: async () => ({
    user: { id: "user-1", email: "user@example.test" },
  }),
}));
vi.mock("../lib/limits", () => ({
  enforceBulkLimits: () => ({ ok: true }),
  recordRun: vi.fn(),
}));
vi.mock("../lib/watch-db", () => ({
  deleteWatch: vi.fn(),
  findWatchByQuery: mocks.findWatchByQuery,
  insertWatch: mocks.insertWatch,
  listWatches: vi.fn(() => []),
}));
vi.mock("@starter/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@starter/shared")>()),
  runCheck: mocks.runCheck,
}));

import * as check from "../routes/check/index";
import * as bulk from "../routes/check/bulk";
import * as compare from "../routes/check/compare";
import * as watch from "../routes/watch";
import { createCheckJobsHandler } from "../lib/check-job-handler";
import { CheckJobError } from "../lib/check-jobs";

afterEach(() => {
  vi.clearAllMocks();
});

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function respond(
  handler: (req: Request) => Promise<Response>,
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await handler(post(path, body));
  return { status: response.status, body: await response.json() };
}

const long = "x".repeat(81);

describe("POST /api/check", () => {
  it.each<[string, unknown]>([
    ["malformed JSON", "{"],
    ["null", null],
    ["empty object", {}],
    ["blank query", { query: "  " }],
    ["long query", { query: long }],
    ["bad category and concurrency", { query: "a", categories: ["x"], concurrency: 99 }],
    ["string timeout", { query: "a", timeoutMs: "5000" }],
  ])("rejects %s", async (_name, body) => {
    expect(await respond(check.POST, "/api/check", body)).toMatchSnapshot();
  });
});

describe("POST /api/check/bulk", () => {
  it.each<[string, unknown]>([
    ["malformed JSON", "{"],
    ["empty object", {}],
    ["empty queries", { queries: [] }],
    ["too many queries", { queries: Array.from({ length: 101 }, (_, i) => `n${i}`) }],
    ["blank entry", { queries: ["ok", ""] }],
    ["bad category", { queries: ["ok"], categories: ["x"] }],
  ])("rejects %s", async (_name, body) => {
    expect(await respond(bulk.POST, "/api/check/bulk", body)).toMatchSnapshot();
  });
});

describe("POST /api/check/compare", () => {
  it.each<[string, unknown]>([
    ["malformed JSON", "{"],
    ["array", []],
    ["eleven queries", { queries: Array.from({ length: 11 }, (_, i) => `n${i}`) }],
    ["batchConcurrency 11", { queries: ["a", "b"], batchConcurrency: 11 }],
  ])("rejects %s", async (_name, body) => {
    expect(await respond(compare.POST, "/api/check/compare", body)).toMatchSnapshot();
  });
});

describe("POST /api/watch", () => {
  it.each<[string, unknown]>([
    ["malformed JSON", "{"],
    ["empty object", {}],
    ["empty query", { query: "" }],
    ["long query", { query: long }],
    ["numeric query", { query: 7 }],
    ["bad category", { query: "a", categories: ["x"] }],
    ["providers not strings", { query: "a", providers: [1] }],
  ])("rejects %s", async (_name, body) => {
    expect(await respond(watch.POST, "/api/watch", body)).toMatchSnapshot();
  });

  it("passes the untrimmed query and strips unknown keys", async () => {
    mocks.findWatchByQuery.mockReturnValue(null);
    mocks.runCheck.mockResolvedValue({ verdict: "likely_available" });
    mocks.insertWatch.mockReturnValue({ id: "w1" });
    const result = await respond(watch.POST, "/api/watch", {
      query: "  spaced ",
      categories: ["domain"],
      extra: 1,
    });
    expect(result).toEqual({
      status: 201,
      body: { id: "w1", existed: false, verdict: "likely_available" },
    });
    expect(mocks.runCheck).toHaveBeenCalledWith({
      query: "  spaced ",
      categories: ["domain"],
      providers: undefined,
    });
    expect(mocks.insertWatch).toHaveBeenCalledWith({
      userId: "user-1",
      query: "  spaced ",
      categories: ["domain"],
      providers: undefined,
      summary: { verdict: "likely_available" },
    });
  });
});

describe("POST /api/check/jobs envelope", () => {
  const reserve = vi.fn();
  const handler = createCheckJobsHandler({
    store: { reserve } as never,
    session: async () => null,
    rateIdentity: () => "ip",
    rateLimit: 10,
    draining: () => false,
  });
  const operationId = "6f1c1f0e-8a3b-4c2d-9e4f-0a1b2c3d4e5f";
  const base = { operationId, owner: "anonymous" };

  async function run(body: unknown): Promise<unknown> {
    reserve.mockImplementation(() => {
      throw new CheckJobError("captured", 409);
    });
    const response = await handler(post("/api/check/jobs", body));
    return {
      status: response.status,
      body: await response.json(),
      reserved: reserve.mock.calls.map(([arg]) => {
        const { rateIdentity: _r, rateLimit: _l, ...rest } = arg as Record<
          string,
          unknown
        >;
        return rest;
      }),
    };
  }

  it.each<[string, unknown]>([
    ["single, after defaults to 0, unknown keys stripped", {
      ...base,
      kind: "single",
      input: { query: " acme ", extra: 1 },
      extra: 2,
    }],
    ["bulk with after", {
      ...base,
      after: 7,
      kind: "bulk",
      input: { queries: ["a", " b "], timeoutMs: 5000 },
    }],
    ["compare at MAX_SAFE_INTEGER", {
      ...base,
      after: Number.MAX_SAFE_INTEGER,
      kind: "compare",
      input: { queries: ["a", "b"], batchConcurrency: 3 },
    }],
    ["uppercase and any-version uuid", {
      ...base,
      operationId: "12345678-1234-1234-1234-123456789ABC",
      kind: "single",
      input: { query: "a" },
    }],
    ["nil uuid", {
      ...base,
      operationId: "00000000-0000-0000-0000-000000000000",
      kind: "single",
      input: { query: "a" },
    }],
    ["owner at 200 chars (session mismatch)", {
      ...base,
      owner: "o".repeat(200),
      kind: "single",
      input: { query: "a" },
    }],
    ["malformed JSON", "{"],
    ["no kind", { ...base, input: { query: "a" } }],
    ["unknown kind", { ...base, kind: "other", input: { query: "a" } }],
    ["single with bulk input", { ...base, kind: "single", input: { queries: ["a"] } }],
    ["bad inner input", { ...base, kind: "bulk", input: { queries: [] } }],
    ["non-uuid operationId", { ...base, operationId: "abc", kind: "single", input: { query: "a" } }],
    ["uuid with braces", { ...base, operationId: `{${operationId}}`, kind: "single", input: { query: "a" } }],
    ["owner over 200 chars", { ...base, owner: "o".repeat(201), kind: "single", input: { query: "a" } }],
    ["negative after", { ...base, after: -1, kind: "single", input: { query: "a" } }],
    ["fractional after", { ...base, after: 1.5, kind: "single", input: { query: "a" } }],
    ["after over MAX_SAFE_INTEGER", { ...base, after: Number.MAX_SAFE_INTEGER + 2, kind: "single", input: { query: "a" } }],
    ["null after", { ...base, after: null, kind: "single", input: { query: "a" } }],
    ["array body", []],
  ])("handles %s", async (_name, body) => {
    expect(await run(body)).toMatchSnapshot();
  });
});
