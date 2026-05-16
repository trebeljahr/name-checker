const DEFAULT_LIMIT = 30;
const WINDOW_MS = 60 * 60 * 1000;
const CACHE_MAX = 200;
const CACHE_TTL_MS = 10 * 60 * 1000;

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

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

type CacheEntry<V> = { value: V; expiresAt: number };

class LruCache<V> {
  private readonly store = new Map<string, CacheEntry<V>>();

  constructor(
    private readonly max: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.store.size > this.max) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }
}

export const checkResponseCache = new LruCache<unknown>(CACHE_MAX, CACHE_TTL_MS);

export function cacheKey(input: unknown): string {
  return JSON.stringify(input);
}
