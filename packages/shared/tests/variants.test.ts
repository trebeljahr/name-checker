import { describe, expect, it } from "vitest";
import { suggestVariants } from "../src/index.js";

describe("suggestVariants", () => {
  it("defaults to 20 suggestions", () => {
    const out = suggestVariants("kairos");
    expect(out).toHaveLength(20);
  });

  it("returns deterministic output", () => {
    const a = suggestVariants("kairos");
    const b = suggestVariants("kairos");
    expect(a).toEqual(b);
  });

  it("does not include the query itself", () => {
    const out = suggestVariants("kairos", { count: 100 });
    expect(out).not.toContain("kairos");
  });

  it("output only matches DNS-label charset (a-z, 0-9, internal hyphens)", () => {
    const out = suggestVariants("kairos", { count: 100, includeMutations: true });
    for (const v of out) {
      expect(v).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(v.length).toBeGreaterThanOrEqual(3);
      expect(v.length).toBeLessThanOrEqual(24);
    }
  });

  it("dedupes within the list", () => {
    const out = suggestVariants("kairos", { count: 100, includeMutations: true });
    expect(new Set(out).size).toBe(out.length);
  });

  it("normalises mixed-case and stray chars", () => {
    const out = suggestVariants("Kai-Ros!", { count: 5 });
    expect(out[0]).toBe("getkairos");
  });

  it("returns empty array for empty query", () => {
    expect(suggestVariants("")).toEqual([]);
    expect(suggestVariants("   ")).toEqual([]);
    expect(suggestVariants("!!!")).toEqual([]);
  });

  it("returns empty array for count <= 0", () => {
    expect(suggestVariants("kairos", { count: 0 })).toEqual([]);
  });

  it("excludes mutations by default", () => {
    const out = suggestVariants("kairos", { count: 100 });
    expect(out).not.toContain("keiros");
    expect(out).not.toContain("kuiros");
  });

  it("includes mutations when requested", () => {
    const out = suggestVariants("kairos", {
      count: 100,
      includeMutations: true,
    });
    expect(out).toContain("keiros");
  });

  it("skips compound nouns already in the base", () => {
    const out = suggestVariants("kairosprotocol", { count: 100 });
    expect(out).not.toContain("kairosprotocolprotocol");
  });

  it("can disable compounds", () => {
    const out = suggestVariants("kairos", {
      count: 100,
      includeCompounds: false,
    });
    expect(out).not.toContain("kairosprotocol");
  });

  it("orders prefix/suffix before compounds before truncation/mutations", () => {
    const out = suggestVariants("kairos", {
      count: 100,
      includeMutations: true,
    });
    const idxPrefix = out.indexOf("getkairos");
    const idxSuffix = out.indexOf("kairosapp");
    const idxCompound = out.indexOf("kairosproject");
    const idxTrunc = out.indexOf("kair");
    expect(idxPrefix).toBeGreaterThanOrEqual(0);
    expect(idxSuffix).toBeGreaterThanOrEqual(0);
    expect(idxCompound).toBeGreaterThanOrEqual(0);
    expect(idxTrunc).toBeGreaterThanOrEqual(0);
    expect(idxPrefix).toBeLessThan(idxCompound);
    expect(idxSuffix).toBeLessThan(idxCompound);
    expect(idxCompound).toBeLessThan(idxTrunc);
  });

  it("drops candidates that would exceed max length", () => {
    const long = "a".repeat(22);
    const out = suggestVariants(long, { count: 100 });
    for (const v of out) {
      expect(v.length).toBeLessThanOrEqual(24);
    }
  });

  it("drops candidates that would be too short", () => {
    const out = suggestVariants("ab", { count: 100 });
    for (const v of out) {
      expect(v.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("respects count limit", () => {
    expect(suggestVariants("kairos", { count: 5 })).toHaveLength(5);
    expect(suggestVariants("kairos", { count: 1 })).toHaveLength(1);
  });
});
