import { describe, it, expect } from "vitest";
import { metaphone } from "../src/phonetic.js";
import { normalizeHomoglyphs } from "../src/homoglyph.js";
import { scanCollisions } from "../src/collision.js";
import type { CheckSummary, ProviderResult } from "../src/types.js";

describe("metaphone", () => {
  it("returns the same code for kairos and kayros", () => {
    expect(metaphone("kairos")).toBe(metaphone("kayros"));
  });

  it("returns the same code for Smith and Smyth", () => {
    expect(metaphone("Smith")).toBe(metaphone("Smyth"));
  });

  it("returns empty string for empty input", () => {
    expect(metaphone("")).toBe("");
  });

  it("strips silent leading KN", () => {
    expect(metaphone("knight")).toBe(metaphone("night"));
  });

  it("collapses PH to F", () => {
    expect(metaphone("phone")).toBe(metaphone("fone"));
  });
});

describe("normalizeHomoglyphs", () => {
  it("folds 0 to o", () => {
    expect(normalizeHomoglyphs("kair0s")).toBe("kairos");
  });

  it("folds Cyrillic а to Latin a", () => {
    expect(normalizeHomoglyphs("kаiros")).toBe("kairos");
  });

  it("folds Cyrillic е to Latin e", () => {
    expect(normalizeHomoglyphs("hеllo")).toBe("hello");
  });

  it("lowercases ASCII", () => {
    expect(normalizeHomoglyphs("KAIROS")).toBe("kairos");
  });

  it("strips combining accents", () => {
    expect(normalizeHomoglyphs("café")).toBe("cafe");
  });

  it("returns empty for empty input", () => {
    expect(normalizeHomoglyphs("")).toBe("");
  });
});

function buildSummary(
  evidence: Array<{ providerId: string; title: string }>,
): CheckSummary {
  const results: ProviderResult[] = evidence.map((e) => ({
    providerId: e.providerId,
    providerName: e.providerId,
    category: "domain",
    query: "kairos",
    durationMs: 0,
    status: "taken",
    evidence: [{ title: e.title, url: "" }],
  }));
  return {
    query: "kairos",
    startedAt: "2026-05-16T00:00:00.000Z",
    finishedAt: "2026-05-16T00:00:00.000Z",
    totalMs: 0,
    results,
    rollup: {
      available: 0,
      taken: results.length,
      partial: 0,
      manual_verify: 0,
      unknown: 0,
      error: 0,
    },
    verdict: "likely_taken",
  };
}

describe("scanCollisions", () => {
  it("flags phonetic collision for kayros", () => {
    const summary = buildSummary([
      { providerId: "p1", title: "kayros studios" },
    ]);
    const report = scanCollisions("kairos", summary);
    expect(report.phoneticHits).toHaveLength(1);
    expect(report.phoneticHits[0]).toMatchObject({
      providerId: "p1",
      foundName: "kayros",
    });
    expect(report.homoglyphHits).toHaveLength(0);
  });

  it("flags homoglyph collision for kair0s", () => {
    const summary = buildSummary([
      { providerId: "p2", title: "kair0s app" },
    ]);
    const report = scanCollisions("kairos", summary);
    expect(report.homoglyphHits).toHaveLength(1);
    expect(report.homoglyphHits[0]).toMatchObject({
      providerId: "p2",
      foundName: "kair0s",
    });
  });

  it("flags homoglyph collision for Cyrillic kаiros", () => {
    const summary = buildSummary([
      { providerId: "p3", title: "kаiros llc" },
    ]);
    const report = scanCollisions("kairos", summary);
    expect(report.homoglyphHits).toHaveLength(1);
    expect(report.homoglyphHits[0].providerId).toBe("p3");
  });

  it("ignores exact-match titles", () => {
    const summary = buildSummary([{ providerId: "p4", title: "kairos" }]);
    const report = scanCollisions("kairos", summary);
    expect(report.phoneticHits).toHaveLength(0);
    expect(report.homoglyphHits).toHaveLength(0);
  });

  it("deduplicates identical hits within a provider", () => {
    const summary = buildSummary([
      { providerId: "p5", title: "kayros kayros kayros" },
    ]);
    const report = scanCollisions("kairos", summary);
    expect(report.phoneticHits).toHaveLength(1);
  });

  it("returns empty report when no results", () => {
    const summary = buildSummary([]);
    const report = scanCollisions("kairos", summary);
    expect(report).toEqual({
      query: "kairos",
      phoneticHits: [],
      homoglyphHits: [],
    });
  });
});
