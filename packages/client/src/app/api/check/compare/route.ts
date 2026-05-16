import { NextResponse } from "next/server";
import {
  compareRequestSchema,
  getCache,
  runCheck,
  selectProviders,
  type CheckSummary,
  type ProviderCategory,
  type ProviderResult,
} from "@starter/shared";
import {
  cacheKey,
  checkRateLimit,
  getClientIp,
} from "@/lib/rate-limit-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_CONCURRENCY_DEFAULT = 4;
const COMPARE_TTL_SECONDS = 10 * 60;

type CompareRequest = {
  queries: string[];
  categories?: ProviderCategory[];
  providers?: string[];
  excludeProviders?: string[];
  timeoutMs?: number;
  concurrency?: number;
  batchConcurrency?: number;
};

export async function POST(req: Request): Promise<Response> {
  const rl = checkRateLimit(getClientIp(req));
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = compareRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  return streamCompare(parsed.data);
}

function streamCompare(req: CompareRequest): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown): void => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        const cache = getCache();
        const providersPreview = selectProviders({
          query: req.queries[0]!,
          categories: req.categories,
          providers: req.providers,
          excludeProviders: req.excludeProviders,
        });
        send("start", {
          queries: req.queries,
          providers: providersPreview.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
          })),
        });

        const concurrency = Math.max(
          1,
          Math.min(req.batchConcurrency ?? BATCH_CONCURRENCY_DEFAULT, req.queries.length),
        );
        const results: CheckSummary[] = new Array(req.queries.length);
        let cursor = 0;
        const worker = async (): Promise<void> => {
          while (true) {
            const i = cursor++;
            if (i >= req.queries.length) return;
            const q = req.queries[i]!;
            send("query_start", { query: q, index: i });
            const key = `check:${cacheKey({
              query: q,
              categories: req.categories,
              providers: req.providers,
              excludeProviders: req.excludeProviders,
            })}`;
            const cached = await cache.get<CheckSummary>(key);
            if (cached !== null) {
              for (const r of cached.results) {
                send("result", { query: q, index: i, result: r });
              }
              send("query_done", { query: q, index: i, summary: cached });
              results[i] = cached;
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
              (r: ProviderResult) =>
                send("result", { query: q, index: i, result: r }),
            );
            results[i] = summary;
            await cache.set(key, summary, COMPARE_TTL_SECONDS);
            send("query_done", { query: q, index: i, summary });
          }
        };

        await Promise.all(Array.from({ length: concurrency }, () => worker()));

        send("done", { queries: req.queries, results });
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : String(err),
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
