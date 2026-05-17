import type {
  CheckStatus,
  ProviderCategory,
  Subverdict,
  Verdict,
} from "./types.js";

export const CATEGORIES = [
  "trademark",
  "domain",
  "social",
  "appstore",
  "package",
  "code",
] as const satisfies readonly ProviderCategory[];

export const ALL_STATUSES = [
  "available",
  "taken",
  "partial",
  "manual_verify",
  "unknown",
  "error",
] as const satisfies readonly CheckStatus[];

export const VERDICT_SHORT_LABEL: Record<Verdict, string> = {
  likely_available: "AVAIL",
  likely_taken: "TAKEN",
  mixed: "MIXED",
};

export const VERDICT_LONG_LABEL: Record<Verdict, string> = {
  likely_available: "LIKELY AVAILABLE",
  likely_taken: "LIKELY TAKEN",
  mixed: "MIXED — VERIFY MANUALLY",
};

export const STATUS_LONG_LABEL: Record<CheckStatus, string> = {
  available: "AVAILABLE",
  taken: "TAKEN",
  partial: "PARTIAL",
  manual_verify: "VERIFY",
  unknown: "UNKNOWN",
  error: "ERROR",
};

export const STATUS_SHORT_LABEL: Record<CheckStatus, string> = {
  available: "AVAIL",
  taken: "TAKEN",
  partial: "PART ",
  manual_verify: "CHECK",
  unknown: "UNKN ",
  error: "ERROR",
};

export const SUBVERDICT_LABEL: Record<Subverdict, string> = {
  clear: "CLEAR",
  caution: "CAUTION",
  blocked: "BLOCKED",
};

export const DEFAULT_VARIANT_PROVIDERS = [
  "domain-com",
  "npm",
  "github-user",
  "bluesky",
] as const satisfies readonly string[];
