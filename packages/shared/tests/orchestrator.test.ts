import { describe, expect, it } from "vitest";
import {
  runCheckWithProviders,
  type CheckStatus,
  type Provider,
  type ProviderCategory,
  type ProviderResult,
} from "../src/index.js";

function fakeProvider(
  id: string,
  status: CheckStatus,
  opts: {
    category?: ProviderCategory;
    delayMs?: number;
    detail?: string;
  } = {},
): Provider {
  return {
    id,
    name: `fake ${id}`,
    category: opts.category ?? "social",
    async check() {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      return { status, detail: opts.detail };
    },
  };
}

describe("runCheckWithProviders — rollup", () => {
  it("counts each status exactly once", async () => {
    const providers: Provider[] = [
      fakeProvider("a", "available"),
      fakeProvider("b", "taken"),
      fakeProvider("c", "partial"),
      fakeProvider("d", "manual_verify"),
      fakeProvider("e", "unknown"),
      fakeProvider("f", "error"),
    ];
    const s = await runCheckWithProviders(providers, { query: "foo" });
    expect(s.rollup).toEqual({
      available: 1,
      taken: 1,
      partial: 1,
      manual_verify: 1,
      unknown: 1,
      error: 1,
    });
    expect(s.results).toHaveLength(6);
  });
});

describe("runCheckWithProviders — verdict", () => {
  it("any taken → likely_taken", async () => {
    const s = await runCheckWithProviders(
      [fakeProvider("a", "available"), fakeProvider("b", "taken")],
      { query: "foo" },
    );
    expect(s.verdict).toBe("likely_taken");
  });

  it("partial alone → likely_taken (partial counts as evidence)", async () => {
    const s = await runCheckWithProviders(
      [fakeProvider("a", "available"), fakeProvider("b", "partial")],
      { query: "foo" },
    );
    expect(s.verdict).toBe("likely_taken");
  });

  it("all available → likely_available", async () => {
    const s = await runCheckWithProviders(
      [
        fakeProvider("a", "available"),
        fakeProvider("b", "available"),
        fakeProvider("c", "available"),
      ],
      { query: "foo" },
    );
    expect(s.verdict).toBe("likely_available");
  });

  it("only unknown / manual_verify / error → mixed", async () => {
    const s = await runCheckWithProviders(
      [
        fakeProvider("a", "unknown"),
        fakeProvider("b", "manual_verify"),
        fakeProvider("c", "error"),
      ],
      { query: "foo" },
    );
    expect(s.verdict).toBe("mixed");
  });
});

describe("runCheckWithProviders — concurrency cap", () => {
  it("never exceeds the configured concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const tick = (): Promise<void> =>
      new Promise((r) => setTimeout(r, 30));
    const providers: Provider[] = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      name: `p${i}`,
      category: "social",
      async check() {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await tick();
        inFlight -= 1;
        return { status: "available" as CheckStatus };
      },
    }));
    await runCheckWithProviders(providers, { query: "foo", concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(0);
  });
});

describe("runCheckWithProviders — result order", () => {
  it("results[] match input provider order even when finish order differs", async () => {
    const providers: Provider[] = [
      fakeProvider("slow", "available", { delayMs: 40 }),
      fakeProvider("fast", "taken", { delayMs: 5 }),
      fakeProvider("medium", "partial", { delayMs: 20 }),
    ];
    const onResult: ProviderResult[] = [];
    const s = await runCheckWithProviders(
      providers,
      { query: "foo", concurrency: 3 },
      (r) => onResult.push(r),
    );
    expect(s.results.map((r) => r.providerId)).toEqual(["slow", "fast", "medium"]);
    expect(onResult.map((r) => r.providerId).sort()).toEqual(
      ["fast", "medium", "slow"],
    );
  });
});

describe("runCheckWithProviders — error path", () => {
  it("provider that throws yields status=error with message", async () => {
    const boom: Provider = {
      id: "boom",
      name: "boom",
      category: "social",
      async check() {
        throw new Error("kaboom");
      },
    };
    const s = await runCheckWithProviders([boom], { query: "foo" });
    expect(s.results[0]?.status).toBe("error");
    expect(s.results[0]?.error).toBe("kaboom");
  });

  it("rejects when query is empty after safeQuery", async () => {
    await expect(
      runCheckWithProviders([fakeProvider("a", "available")], { query: "   " }),
    ).rejects.toThrow(/query is required/);
  });
});
