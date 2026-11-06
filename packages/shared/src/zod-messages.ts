import type { z } from "zod";

// Zod 4 rewrote its default English error messages. API responses
// (`issues` from `error.flatten()`) and MCP tool errors expose those
// messages, so request parsing passes this map to keep the zod 3 text
// callers already know. It is a parse-level option on purpose: a global
// `z.config()` would also change the messages of better-auth, which shares
// this zod instance. Codes it does not cover fall back to zod 4's text.

function parsedType(input: unknown): string {
  switch (typeof input) {
    case "undefined":
      return "undefined";
    case "string":
      return "string";
    case "number":
      return Number.isNaN(input) ? "nan" : "number";
    case "boolean":
      return "boolean";
    case "function":
      return "function";
    case "bigint":
      return "bigint";
    case "symbol":
      return "symbol";
    default:
      if (Array.isArray(input)) return "array";
      if (input === null) return "null";
      if (
        typeof (input as { then?: unknown }).then === "function" &&
        typeof (input as { catch?: unknown }).catch === "function"
      )
        return "promise";
      if (input instanceof Map) return "map";
      if (input instanceof Set) return "set";
      if (input instanceof Date) return "date";
      return "object";
  }
}

function joinValues(values: readonly unknown[]): string {
  return values
    .map((value) => (typeof value === "string" ? `'${value}'` : String(value)))
    .join(" | ");
}

export const zod3ErrorMessages: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case "invalid_type": {
      if (issue.input === undefined) return "Required";
      // Zod 3 reported `.int()` failures as "integer" vs "float".
      if (issue.expected === "int") return "Expected integer, received float";
      return `Expected ${issue.expected}, received ${parsedType(issue.input)}`;
    }
    case "invalid_value": {
      const def = issue.inst?._zod.def;
      if (!def || !("type" in def) || def.type !== "enum") {
        if (issue.values.length !== 1) return undefined;
        return `Invalid literal value, expected ${JSON.stringify(issue.values[0])}`;
      }
      const options = joinValues(issue.values);
      // Zod 3 type-checked enums first: a non-string got invalid_type.
      if (issue.input === undefined) return "Required";
      if (typeof issue.input !== "string")
        return `Expected ${options}, received ${parsedType(issue.input)}`;
      return `Invalid enum value. Expected ${options}, received '${issue.input}'`;
    }
    case "too_small": {
      const { origin, exact, inclusive, minimum } = issue;
      if (origin === "array")
        return `Array must contain ${exact ? "exactly" : inclusive ? "at least" : "more than"} ${minimum} element(s)`;
      if (origin === "string")
        return `String must contain ${exact ? "exactly" : inclusive ? "at least" : "over"} ${minimum} character(s)`;
      if (origin === "number" || origin === "int" || origin === "bigint")
        return `Number must be ${exact ? "exactly equal to " : inclusive ? "greater than or equal to " : "greater than "}${minimum}`;
      return undefined;
    }
    case "too_big": {
      const { origin, exact, inclusive, maximum } = issue;
      if (origin === "array")
        return `Array must contain ${exact ? "exactly" : inclusive ? "at most" : "less than"} ${maximum} element(s)`;
      if (origin === "string")
        return `String must contain ${exact ? "exactly" : inclusive ? "at most" : "under"} ${maximum} character(s)`;
      if (origin === "number" || origin === "int")
        return `Number must be ${exact ? "exactly" : inclusive ? "less than or equal to" : "less than"} ${maximum}`;
      if (origin === "bigint")
        return `BigInt must be ${exact ? "exactly" : inclusive ? "less than or equal to" : "less than"} ${maximum}`;
      return undefined;
    }
    case "invalid_format":
      return issue.format === "regex" ? "Invalid" : `Invalid ${issue.format}`;
    case "invalid_union":
    case "custom":
      return "Invalid input";
    case "unrecognized_keys":
      return `Unrecognized key(s) in object: ${issue.keys.join(", ")}`;
    case "not_multiple_of":
      return `Number must be a multiple of ${issue.divisor}`;
    default:
      return undefined;
  }
};

/** Parse options for every request schema: `schema.safeParse(body, requestParseOptions)`. */
export const requestParseOptions = { error: zod3ErrorMessages } as const;
