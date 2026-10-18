const DEFAULT_LIMIT = 30;
const WINDOW_MS = 60 * 60 * 1000;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

export function checkRateLimit(ip: string): RateLimitResult {
  if (process.env.NODE_ENV !== "production") return { ok: true };

  const limit = Number(process.env.RATE_LIMIT_PER_HOUR) || DEFAULT_LIMIT;
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { ok: true };
}

/**
 * The visitor's address for rate limits. Behind the Cloudflare proxy every
 * request reaches Traefik from a Cloudflare edge address, which Traefik
 * reports as X-Forwarded-For, so many visitors would share one bucket;
 * Cloudflare names the visitor in CF-Connecting-IP. A request sent to the
 * origin directly can forge that header, as it could forge the others.
 */
export function getClientIp(req: Request): string {
  const cloudflare = req.headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function cacheKey(input: unknown): string {
  return JSON.stringify(input);
}
