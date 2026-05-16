export type ProviderCategory =
  | "trademark"
  | "domain"
  | "social"
  | "appstore"
  | "package"
  | "code";

export type CheckStatus =
  | "available"
  | "taken"
  | "partial"
  | "manual_verify"
  | "unknown"
  | "error";

export type Evidence = {
  title: string;
  url: string;
  snippet?: string;
};

export type ProviderCheckOutput = {
  status: CheckStatus;
  verifyUrl?: string;
  evidence?: Evidence[];
  detail?: string;
  error?: string;
};

export type ProviderResult = ProviderCheckOutput & {
  providerId: string;
  providerName: string;
  category: ProviderCategory;
  query: string;
  durationMs: number;
};

export type Provider = {
  id: string;
  name: string;
  category: ProviderCategory;
  description?: string;
  check: (query: string, signal?: AbortSignal) => Promise<ProviderCheckOutput>;
};

export type CheckRequest = {
  query: string;
  categories?: ProviderCategory[];
  providers?: string[];
  excludeProviders?: string[];
  timeoutMs?: number;
  concurrency?: number;
};

export type Verdict = "likely_available" | "likely_taken" | "mixed";

export type Subverdict = "clear" | "caution" | "blocked";

export type ScoreBreakdownEntry = {
  providerId: string;
  delta: number;
  reason: string;
};

export type CheckSummary = {
  query: string;
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  results: ProviderResult[];
  rollup: Record<CheckStatus, number>;
  verdict: Verdict;
  score: number;
  scoreBreakdown: ScoreBreakdownEntry[];
  subverdicts: Record<ProviderCategory, Subverdict>;
};

export type BatchCheckRequest = {
  queries: string[];
  categories?: ProviderCategory[];
  providers?: string[];
  excludeProviders?: string[];
  timeoutMs?: number;
  concurrency?: number;
  batchConcurrency?: number;
};

export type BatchCheckSummary = {
  queries: string[];
  results: CheckSummary[];
  totalMs: number;
};

export type FreeAnywhereResult = {
  freeNames: string[];
  requiredProviders: string[];
  requiredCategories: ProviderCategory[];
  allResults: CheckSummary[];
  totalMs: number;
};
