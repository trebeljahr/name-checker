import { NextResponse } from "next/server";
import {
  bulkCheckRequestSchema,
  MAX_BULK_QUERIES,
  runCheck,
  getCache,
  type CheckSummary,
  type ProviderCategory,
  type ProviderResult,
} from "@starter/shared";
import { cacheKey, checkRateLimit, getClientIp } from "@/lib/rate-limit-cache";
import { enforceBulkLimits, recordRun, requirePlan } from "@/lib/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BULK = MAX_BULK_QUERIES;
const BULK_TTL_SECONDS = 10 * 60;

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

  const gate = await requirePlan(req);
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status });
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

  const limit = enforceBulkLimits(gate.plan, gate.user.id, queries.length);
  if (!limit.ok) {
    return NextResponse.json(limit.body, { status: limit.status });
  }

  recordRun(gate.user.id);

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
  const cache = getCache();
  const key = `check:${cacheKey({
    query,
    categories: req.categories,
    providers: req.providers,
    excludeProviders: req.excludeProviders,
  })}`;
  const cached = await cache.get<CheckSummary>(key);
  if (cached !== null) return cached;
  const summary = await runCheck({
    query,
    categories: req.categories,
    providers: req.providers,
    excludeProviders: req.excludeProviders,
    timeoutMs: req.timeoutMs,
    concurrency: req.concurrency,
  });
  await cache.set(key, summary, BULK_TTL_SECONDS);
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
      const cache = getCache();
      try {
        send("batch_start", { count: queries.length, queries });
        for (const q of queries) {
          send("query_start", { query: q });
          const key = `check:${cacheKey({
            query: q,
            categories: req.categories,
            providers: req.providers,
            excludeProviders: req.excludeProviders,
          })}`;
          const cached = await cache.get<CheckSummary>(key);
          if (cached !== null) {
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
          await cache.set(key, summary, BULK_TTL_SECONDS);
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
