import { describe, expect, it } from "vitest";
import { pathParam } from "./path-param";

describe("pathParam", () => {
  it("reads the segment with and without a trailing slash", () => {
    expect(pathParam("/check/acme", "check")).toBe("acme");
    expect(pathParam("/check/acme/", "check")).toBe("acme");
  });
  it("decodes the segment", () => {
    expect(pathParam("/passport/acme%20labs/", "passport")).toBe("acme labs");
  });
  it("keeps a malformed escape as written", () => {
    expect(pathParam("/check/100%/", "check")).toBe("100%");
  });
  it("returns an empty string for another route", () => {
    expect(pathParam("/compare/", "check")).toBe("");
  });
});
