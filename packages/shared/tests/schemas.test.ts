// Characterization tests for every request schema. They pin the parsed
// output and the error text that API and MCP callers see, so a zod upgrade
// cannot change either without a failing test.
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  batchCheckRequestSchema,
  bulkCheckRequestSchema,
  checkRequestSchema,
  checkStatusSchema,
  compareRequestSchema,
  findFreeNamesRequestSchema,
  providerCategorySchema,
} from "../src/schemas.js";

function parse(schema: z.ZodTypeAny, input: unknown): unknown {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    flatten: result.error.flatten(),
    issues: result.error.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
    })),
  };
}

const long = "x".repeat(81);
const many = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `name${i}`);

describe("providerCategorySchema and checkStatusSchema", () => {
  it.each([
    ["domain", providerCategorySchema],
    ["code", providerCategorySchema],
    ["available", checkStatusSchema],
    ["error", checkStatusSchema],
  ])("accepts %s", (value, schema) => {
    expect(parse(schema, value)).toEqual({ ok: true, data: value });
  });

  it("rejects values outside the enum", () => {
    expect(parse(providerCategorySchema, "nope")).toMatchInlineSnapshot(`
      {
        "flatten": {
          "fieldErrors": {},
          "formErrors": [
            "Invalid enum value. Expected 'trademark' | 'domain' | 'social' | 'appstore' | 'package' | 'code', received 'nope'",
          ],
        },
        "issues": [
          {
            "message": "Invalid enum value. Expected 'trademark' | 'domain' | 'social' | 'appstore' | 'package' | 'code', received 'nope'",
            "path": [],
          },
        ],
        "ok": false,
      }
    `);
    expect(parse(checkStatusSchema, "bogus")).toMatchInlineSnapshot(`
      {
        "flatten": {
          "fieldErrors": {},
          "formErrors": [
            "Invalid enum value. Expected 'available' | 'taken' | 'partial' | 'manual_verify' | 'unknown' | 'error', received 'bogus'",
          ],
        },
        "issues": [
          {
            "message": "Invalid enum value. Expected 'available' | 'taken' | 'partial' | 'manual_verify' | 'unknown' | 'error', received 'bogus'",
            "path": [],
          },
        ],
        "ok": false,
      }
    `);
    expect(parse(providerCategorySchema, 3)).toMatchInlineSnapshot(`
      {
        "flatten": {
          "fieldErrors": {},
          "formErrors": [
            "Expected 'trademark' | 'domain' | 'social' | 'appstore' | 'package' | 'code', received number",
          ],
        },
        "issues": [
          {
            "message": "Expected 'trademark' | 'domain' | 'social' | 'appstore' | 'package' | 'code', received number",
            "path": [],
          },
        ],
        "ok": false,
      }
    `);
    expect(parse(providerCategorySchema, undefined)).toMatchInlineSnapshot(`
      {
        "flatten": {
          "fieldErrors": {},
          "formErrors": [
            "Required",
          ],
        },
        "issues": [
          {
            "message": "Required",
            "path": [],
          },
        ],
        "ok": false,
      }
    `);
  });
});

describe("checkRequestSchema", () => {
  it("trims the query and strips unknown keys", () => {
    expect(
      parse(checkRequestSchema, { query: "  acme  ", extra: true }),
    ).toEqual({ ok: true, data: { query: "acme" } });
  });

  it("keeps every optional field at its bounds", () => {
    const input = {
      query: "x".repeat(80),
      categories: ["domain", "social"],
      providers: ["npm"],
      excludeProviders: ["github"],
      timeoutMs: 60_000,
      concurrency: 1,
    };
    expect(parse(checkRequestSchema, input)).toEqual({ ok: true, data: input });
    expect(
      parse(checkRequestSchema, { query: "a", timeoutMs: 1000, concurrency: 50 }),
    ).toEqual({ ok: true, data: { query: "a", timeoutMs: 1000, concurrency: 50 } });
  });

  it("keeps explicit undefined optional fields as absent", () => {
    expect(
      parse(checkRequestSchema, { query: "a", categories: undefined }),
    ).toEqual({ ok: true, data: { query: "a" } });
  });

  it.each<[string, unknown]>([
    ["no body", undefined],
    ["null body", null],
    ["array body", []],
    ["string body", "acme"],
    ["missing query", {}],
    ["empty query", { query: "" }],
    ["blank query", { query: "   " }],
    ["long query", { query: long }],
    ["numeric query", { query: 5 }],
    ["null query", { query: null }],
    ["unknown category", { query: "a", categories: ["nope"] }],
    ["category not array", { query: "a", categories: "domain" }],
    ["provider not string", { query: "a", providers: [1] }],
    ["excludeProviders not array", { query: "a", excludeProviders: "npm" }],
    ["timeout too small", { query: "a", timeoutMs: 999 }],
    ["timeout too big", { query: "a", timeoutMs: 60_001 }],
    ["timeout fractional", { query: "a", timeoutMs: 1000.5 }],
    ["timeout string", { query: "a", timeoutMs: "1000" }],
    ["timeout NaN", { query: "a", timeoutMs: Number.NaN }],
    ["timeout Infinity", { query: "a", timeoutMs: Number.POSITIVE_INFINITY }],
    ["concurrency zero", { query: "a", concurrency: 0 }],
    ["concurrency too big", { query: "a", concurrency: 51 }],
    ["several problems", { query: "", categories: ["x", "domain", "y"], concurrency: 0 }],
  ])("rejects %s", (_name, input) => {
    expect(parse(checkRequestSchema, input)).toMatchSnapshot();
  });
});

describe("bulkCheckRequestSchema", () => {
  it("trims every query and accepts the maximum count", () => {
    expect(
      parse(bulkCheckRequestSchema, { queries: [" a ", "b"], other: 1 }),
    ).toEqual({ ok: true, data: { queries: ["a", "b"] } });
    expect(parse(bulkCheckRequestSchema, { queries: many(100) })).toEqual({
      ok: true,
      data: { queries: many(100) },
    });
  });

  it.each<[string, unknown]>([
    ["missing queries", {}],
    ["empty queries", { queries: [] }],
    ["too many queries", { queries: many(101) }],
    ["blank entry", { queries: ["a", " "] }],
    ["long entry", { queries: ["a", long] }],
    ["queries not array", { queries: "a" }],
    ["unknown category", { queries: ["a"], categories: ["nope"] }],
    ["timeout too small", { queries: ["a"], timeoutMs: 10 }],
    ["batchConcurrency is stripped, not checked", { queries: ["a"], batchConcurrency: 0 }],
  ])("handles %s", (_name, input) => {
    expect(parse(bulkCheckRequestSchema, input)).toMatchSnapshot();
  });
});

describe("batchCheckRequestSchema", () => {
  it("accepts batchConcurrency in range", () => {
    expect(
      parse(batchCheckRequestSchema, { queries: ["a"], batchConcurrency: 20 }),
    ).toEqual({ ok: true, data: { queries: ["a"], batchConcurrency: 20 } });
  });

  it.each<[string, unknown]>([
    ["batchConcurrency zero", { queries: ["a"], batchConcurrency: 0 }],
    ["batchConcurrency too big", { queries: ["a"], batchConcurrency: 21 }],
    ["batchConcurrency fractional", { queries: ["a"], batchConcurrency: 1.5 }],
    ["empty queries", { queries: [] }],
  ])("rejects %s", (_name, input) => {
    expect(parse(batchCheckRequestSchema, input)).toMatchSnapshot();
  });
});

describe("findFreeNamesRequestSchema", () => {
  it("accepts required providers and categories", () => {
    const input = {
      queries: ["a"],
      requireAvailableProviders: ["npm"],
      requireAvailableCategories: ["package"],
      batchConcurrency: 1,
    };
    expect(parse(findFreeNamesRequestSchema, input)).toEqual({
      ok: true,
      data: input,
    });
  });

  it.each<[string, unknown]>([
    ["unknown required category", { queries: ["a"], requireAvailableCategories: ["x"] }],
    ["required providers not strings", { queries: ["a"], requireAvailableProviders: [null] }],
    ["too many queries", { queries: many(101) }],
    ["categories key is stripped", { queries: ["a"], categories: ["x"] }],
  ])("handles %s", (_name, input) => {
    expect(parse(findFreeNamesRequestSchema, input)).toMatchSnapshot();
  });
});

describe("compareRequestSchema", () => {
  it("accepts ten queries and batchConcurrency 10", () => {
    expect(
      parse(compareRequestSchema, { queries: many(10), batchConcurrency: 10 }),
    ).toEqual({ ok: true, data: { queries: many(10), batchConcurrency: 10 } });
  });

  it.each<[string, unknown]>([
    ["eleven queries", { queries: many(11) }],
    ["batchConcurrency 11", { queries: ["a", "b"], batchConcurrency: 11 }],
    ["one query passes the schema", { queries: ["a"] }],
    ["blank entry", { queries: ["a", ""] }],
  ])("handles %s", (_name, input) => {
    expect(parse(compareRequestSchema, input)).toMatchSnapshot();
  });
});

describe("MCP error text", () => {
  // The MCP server returns `Invalid arguments: ${error.message}`.
  it("is a JSON list of issues that carries each message and path", () => {
    const result = checkRequestSchema.safeParse({ query: "", concurrency: 0 });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issues = JSON.parse(result.error.message) as Array<{
      message: string;
      path: unknown[];
    }>;
    expect(issues.map(({ message, path }) => ({ message, path }))).toEqual(
      result.error.issues.map(({ message, path }) => ({ message, path })),
    );
  });
});
