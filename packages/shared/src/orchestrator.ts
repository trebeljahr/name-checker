import type {
  BatchCheckRequest,
  BatchCheckSummary,
  CheckRequest,
  CheckStatus,
  CheckSummary,
  Provider,
  ProviderCheckOutput,
  ProviderResult,
  Verdict,
} from "./types.js";
import { allProviders } from "./providers/index.js";
import { safeQuery } from "./normalize.js";
import { scoreSummary } from "./scoring.js";

const EMPTY_ROLLUP: Record<CheckStatus, number> = {
  available: 0,
  taken: 0,
  partial: 0,
  manual_verify: 0,
  unknown: 0,
  error: 0,
};

const PRIORITY_TIER1 = 1;
const PRIORITY_TIER2 = 5;
const PRIORITY_TIER3 = 10;

const PROVIDER_PRIORITY: Record<string, number> = {
  npm: PRIORITY_TIER1,
  pypi: PRIORITY_TIER1,
  crates: PRIORITY_TIER1,
  rubygems: PRIORITY_TIER1,
  bluesky: PRIORITY_TIER1,
  "github-user": PRIORITY_TIER1,
  "github-repo-search": PRIORITY_TIER1,
  "apple-appstore": PRIORITY_TIER2,
  tmview: PRIORITY_TIER2,
  "reddit-user": PRIORITY_TIER2,
  "reddit-sub": PRIORITY_TIER2,
  "mastodon-social": PRIORITY_TIER2,
  "mastodon-gamedev": PRIORITY_TIER2,
};

function providerPriority(id: string): number {
  if (id.startsWith("domain-")) return PRIORITY_TIER1;
  return PROVIDER_PRIORITY[id] ?? PRIORITY_TIER3;
}

export function selectProviders(req: CheckRequest): Provider[] {
  return allProviders
    .filter((p) => {
      if (req.providers && !req.providers.includes(p.id)) return false;
      if (req.excludeProviders && req.excludeProviders.includes(p.id)) return false;
      if (req.categories && !req.categories.includes(p.category)) return false;
      return true;
    })
    .sort((a, b) => providerPriority(a.id) - providerPriority(b.id));
}

export async function runCheck(
  req: CheckRequest,
  onResult?: (r: ProviderResult) => void,
): Promise<CheckSummary> {
  return runCheckWithProviders(selectProviders(req), req, onResult);
}

export async function runCheckWithProviders(
  providers: Provider[],
  req: CheckRequest,
  onResult?: (r: ProviderResult) => void,
): Promise<CheckSummary> {
  const startedAtDate = new Date();
  const concurrency = req.concurrency ?? 20;
  const timeoutMs = req.timeoutMs ?? 7_000;
  const query = safeQuery(req.query);
  if (!query) throw new Error("query is required");

  const results: ProviderResult[] = new Array(providers.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = index++;
      if (i >= providers.length) return;
      const p = providers[i]!;
      const r = await runOne(p, query, timeoutMs);
      results[i] = r;
      onResult?.(r);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, providers.length || 1) }, () => worker()),
  );

  const finishedAtDate = new Date();
  const rollup = tally(results);
  const { score, breakdown, subverdicts } = scoreSummary(results);
  return {
    query,
    startedAt: startedAtDate.toISOString(),
    finishedAt: finishedAtDate.toISOString(),
    totalMs: finishedAtDate.getTime() - startedAtDate.getTime(),
    results,
    rollup,
    verdict: verdictFromScore(score),
    score,
    scoreBreakdown: breakdown,
    subverdicts,
  };
}

function verdictFromScore(score: number): Verdict {
  if (score >= 70) return "likely_available";
  if (score >= 35) return "mixed";
  return "likely_taken";
}

async function runOne(
  p: Provider,
  query: string,
  timeoutMs: number,
): Promise<ProviderResult> {
  const start = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error("provider timeout")), timeoutMs);
  ctrl.signal.addEventListener("abort", () => clearTimeout(t), { once: true });
  try {
    const out = await p.check(query, ctrl.signal);
    return {
      providerId: p.id,
      providerName: p.name,
      category: p.category,
      query,
      durationMs: Date.now() - start,
      ...out,
    };
  } catch (err) {
    return {
      providerId: p.id,
      providerName: p.name,
      category: p.category,
      query,
      durationMs: Date.now() - start,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(t);
  }
}

function tally(results: ProviderResult[]): Record<CheckStatus, number> {
  const r: Record<CheckStatus, number> = { ...EMPTY_ROLLUP };
  for (const x of results) r[x.status]++;
  return r;
}

function wrapCachedProvider(
  p: Provider,
  cache: Map<string, Promise<ProviderCheckOutput>>,
): Provider {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    description: p.description,
    check(query, signal) {
      const key = `${p.id}::${query}`;
      let pending = cache.get(key);
      if (!pending) {
        pending = p.check(query);
        cache.set(key, pending);
      }
      const shared = pending;
      if (!signal) return shared;
      if (signal.aborted) {
        return Promise.reject(signal.reason ?? new Error("aborted"));
      }
      return new Promise<ProviderCheckOutput>((resolve, reject) => {
        const onAbort = (): void =>
          reject(signal.reason ?? new Error("aborted"));
        signal.addEventListener("abort", onAbort, { once: true });
        shared.then(
          (v) => {
            signal.removeEventListener("abort", onAbort);
            resolve(v);
          },
          (err) => {
            signal.removeEventListener("abort", onAbort);
            reject(err);
          },
        );
      });
    },
  };
}

export async function runCheckBatch(
  req: BatchCheckRequest,
): Promise<BatchCheckSummary> {
  const startedAt = Date.now();
  const queries = req.queries.map(safeQuery).filter((q) => q.length > 0);
  if (queries.length === 0) throw new Error("queries is required");

  const concurrency = req.concurrency ?? 8;
  const timeoutMs = req.timeoutMs ?? 12_000;
  const batchConcurrency = req.batchConcurrency ?? 4;

  const baseProviders = selectProviders({
    query: queries[0]!,
    categories: req.categories,
    providers: req.providers,
    excludeProviders: req.excludeProviders,
  });
  const cache = new Map<string, Promise<ProviderCheckOutput>>();
  const cachedProviders = baseProviders.map((p) => wrapCachedProvider(p, cache));

  const results: CheckSummary[] = new Array(queries.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= queries.length) return;
      const q = queries[i]!;
      results[i] = await runCheckWithProviders(cachedProviders, {
        query: q,
        timeoutMs,
        concurrency,
      });
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(batchConcurrency, queries.length) },
      () => worker(),
    ),
  );

  return {
    queries,
    results,
    totalMs: Date.now() - startedAt,
  };
}
