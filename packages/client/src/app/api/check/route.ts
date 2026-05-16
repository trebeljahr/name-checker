import { NextResponse } from "next/server";
import {
  checkRequestSchema,
  runCheck,
  allProviders,
  getCache,
} from "@starter/shared";
import { cacheKey, checkRateLimit, getClientIp } from "@/lib/rate-limit-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const POST_TTL_SECONDS = 10 * 60;
const GET_TTL_SECONDS = 60 * 60;
const PROVIDERS_CACHE_KEY = "providers:list:v1";

type ProvidersPayload = {
  providers: Array<{
    id: string;
    name: string;
    category: string;
    description: string | null;
  }>;
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
  const parsed = checkRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  if (url.searchParams.get("stream") === "1") {
    return streamCheck(parsed.data);
  }

  const cache = getCache();
  const key = cacheKey({
    query: parsed.data.query,
    categories: parsed.data.categories,
    providers: parsed.data.providers,
    excludeProviders: parsed.data.excludeProviders,
  });
  const cached = await cache.get<unknown>(`check:${key}`);
  if (cached !== null) {
    return NextResponse.json(cached, { headers: { "x-cache": "HIT" } });
  }

  const summary = await runCheck(parsed.data);
  await cache.set(`check:${key}`, summary, POST_TTL_SECONDS);
  return NextResponse.json(summary, { headers: { "x-cache": "MISS" } });
}

function streamCheck(req: Parameters<typeof runCheck>[0]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown): void => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      try {
        send("start", { query: req.query });
        const summary = await runCheck(req, (r) => send("result", r));
        send("done", summary);
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

export async function GET(): Promise<Response> {
  const cache = getCache();
  const cached = await cache.get<ProvidersPayload>(PROVIDERS_CACHE_KEY);
  if (cached !== null) {
    return NextResponse.json(cached, { headers: { "x-cache": "HIT" } });
  }
  const payload: ProvidersPayload = {
    providers: allProviders.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      description: p.description ?? null,
    })),
  };
  await cache.set(PROVIDERS_CACHE_KEY, payload, GET_TTL_SECONDS);
  return NextResponse.json(payload, { headers: { "x-cache": "MISS" } });
}
