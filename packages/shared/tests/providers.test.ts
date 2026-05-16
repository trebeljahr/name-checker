import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allProviders,
  type Provider,
  type ProviderResult,
  runCheckWithProviders,
} from "../src/index.js";

function find(id: string): Provider {
  const p = allProviders.find((x) => x.id === id);
  if (!p) throw new Error(`provider ${id} not found`);
  return p;
}

async function runSingle(p: Provider, query = "demoname"): Promise<ProviderResult> {
  const s = await runCheckWithProviders([p], { query, timeoutMs: 2000 });
  return s.results[0]!;
}

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn(impl));
}

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("npm provider", () => {
  const npm = find("npm");

  it("200 → taken", async () => {
    stubFetch(async () => jsonResponse(200, { name: "react" }));
    const r = await runSingle(npm, "react");
    expect(r.status).toBe("taken");
    expect(r.verifyUrl).toContain("npmjs.com/package/react");
  });

  it("404 → available", async () => {
    stubFetch(async () => jsonResponse(404, { error: "Not found" }));
    const r = await runSingle(npm);
    expect(r.status).toBe("available");
  });

  it("500 → manual_verify", async () => {
    stubFetch(async () => new Response("oops", { status: 500 }));
    const r = await runSingle(npm);
    expect(r.status).toBe("manual_verify");
    expect(r.detail).toMatch(/500/);
  });
});

describe("RDAP domain provider (.com)", () => {
  const com = find("domain-com");

  it("200 → taken", async () => {
    stubFetch(async () => jsonResponse(200, { handle: "demoname.com" }));
    const r = await runSingle(com);
    expect(r.status).toBe("taken");
  });

  it("404 → available", async () => {
    stubFetch(async () => jsonResponse(404, {}));
    const r = await runSingle(com);
    expect(r.status).toBe("available");
  });

  it("429 → unknown", async () => {
    stubFetch(async () => new Response("", { status: 429 }));
    const r = await runSingle(com);
    expect(r.status).toBe("unknown");
    expect(r.detail).toMatch(/rate-limited/i);
  });
});

describe("Bluesky provider", () => {
  const bsky = find("bluesky");

  it("200 → taken", async () => {
    stubFetch(async () => jsonResponse(200, { did: "did:plc:abc" }));
    const r = await runSingle(bsky);
    expect(r.status).toBe("taken");
  });

  it("400 → available", async () => {
    stubFetch(async () =>
      jsonResponse(400, { error: "InvalidRequest", message: "Unable to resolve handle" }),
    );
    const r = await runSingle(bsky);
    expect(r.status).toBe("available");
  });
});

describe("GitHub user provider", () => {
  const gh = find("github-user");

  it("200 → taken", async () => {
    stubFetch(async () => jsonResponse(200, { login: "demoname" }));
    const r = await runSingle(gh);
    expect(r.status).toBe("taken");
  });

  it("404 → available", async () => {
    stubFetch(async () => jsonResponse(404, { message: "Not Found" }));
    const r = await runSingle(gh);
    expect(r.status).toBe("available");
  });

  it("403 → unknown (rate-limited)", async () => {
    stubFetch(async () =>
      jsonResponse(403, { message: "API rate limit exceeded" }),
    );
    const r = await runSingle(gh);
    expect(r.status).toBe("unknown");
    expect(r.detail).toMatch(/rate-limit/i);
  });
});
