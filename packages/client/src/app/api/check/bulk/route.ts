import { NextResponse } from "next/server";
import {
  bulkCheckRequestSchema,
  MAX_BULK_QUERIES,
  runCheck,
  type CheckSummary,
  type ProviderCategory,
  type ProviderResult,
} from "@starter/shared";
import {
  cacheKey,
  checkRateLimit,
  checkResponseCache,
  getClientIp,
} from "@/lib/rate-limit-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BULK = MAX_BULK_QUERIES;

type BulkRequest = {
  queries: string[];
  categories?: ProviderCategory[];
  providers?: string[];
  excludeProviders?: string[];
  timeoutMs?: number;
  concurrency?: number;
};

type BatchCheckSummary = {
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  count: number;
  summaries: CheckSummary[];
};

export async function POST(req: Request): Promise<Response> {
  const rl = checkRateLimit(getClientIp(req));
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = bulkCheckRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const queries = dedupe(parsed.data.queries);
  if (queries.length > MAX_BULK) {
    return NextResponse.json(
      { error: `too many queries (max ${MAX_BULK})` },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  if (url.searchParams.get("stream") === "1") {
    return streamBulk(parsed.data, queries);
  }

  const startedAt = new Date();
  const summaries: CheckSummary[] = [];
  for (const q of queries) {
    summaries.push(await runOne(q, parsed.data));
  }
  const finishedAt = new Date();
  const batch: BatchCheckSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    totalMs: finishedAt.getTime() - startedAt.getTime(),
    count: summaries.length,
    summaries,
  };
  return NextResponse.json(batch);
}

async function runOne(query: string, req: BulkRequest): Promise<CheckSummary> {
  const key = cacheKey({
    query,
    categories: req.categories,
    providers: req.providers,
    excludeProviders: req.excludeProviders,
  });
  const cached = checkResponseCache.get(key);
  if (cached !== undefined) return cached as CheckSummary;
  const summary = await runCheck({
    query,
    categories: req.categories,
    providers: req.providers,
    excludeProviders: req.excludeProviders,
    timeoutMs: req.timeoutMs,
    concurrency: req.concurrency,
  });
  checkResponseCache.set(key, summary);
  return summary;
}

function streamBulk(req: BulkRequest, queries: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown): void => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      const startedAt = Date.now();
      try {
        send("batch_start", { count: queries.length, queries });
        for (const q of queries) {
          send("query_start", { query: q });
          const key = cacheKey({
            query: q,
            categories: req.categories,
            providers: req.providers,
            excludeProviders: req.excludeProviders,
          });
          const cached = checkResponseCache.get(key) as CheckSummary | undefined;
          if (cached !== undefined) {
            for (const r of cached.results) send("result", r);
            send("query_done", cached);
            continue;
          }
          const summary = await runCheck(
            {
              query: q,
              categories: req.categories,
              providers: req.providers,
              excludeProviders: req.excludeProviders,
              timeoutMs: req.timeoutMs,
              concurrency: req.concurrency,
            },
            (r: ProviderResult) => send("result", r),
          );
          checkResponseCache.set(key, summary);
          send("query_done", summary);
        }
        send("done", { totalMs: Date.now() - startedAt, count: queries.length });
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : "unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

function dedupe(qs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of qs) {
    const q = raw.trim();
    if (!q) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}
