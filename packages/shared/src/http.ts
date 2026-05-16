const UA = "name-checker/0.1 (+https://github.com/ricotrebeljahr/name-checker)";

export type FetchOpts = {
  signal?: AbortSignal;
  timeoutMs?: number;
  method?: "GET" | "HEAD" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  redirect?: "follow" | "manual" | "error";
};

type HostBucket = { active: number; queue: Array<() => void> };

const DEFAULT_HOST_CAP = 3;

const HOST_LIMITS: Record<string, number> = {
  "api.github.com": 2,
  "www.reddit.com": 2,
  "rdap.org": 4,
};

export class HostLimiter {
  private readonly buckets = new Map<string, HostBucket>();

  cap(host: string): number {
    return HOST_LIMITS[host] ?? DEFAULT_HOST_CAP;
  }

  acquire(host: string): Promise<void> {
    let bucket = this.buckets.get(host);
    if (!bucket) {
      bucket = { active: 0, queue: [] };
      this.buckets.set(host, bucket);
    }
    if (bucket.active < this.cap(host)) {
      bucket.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      bucket!.queue.push(resolve);
    });
  }

  release(host: string): void {
    const bucket = this.buckets.get(host);
    if (!bucket) return;
    const next = bucket.queue.shift();
    if (next) {
      next();
      return;
    }
    bucket.active = Math.max(0, bucket.active - 1);
  }
}

const hostLimiter = new HostLimiter();

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export async function fetchWithTimeout(
  url: string,
  opts: FetchOpts = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);
  const signal = opts.signal ? mergeSignals(opts.signal, ctrl.signal) : ctrl.signal;
  const host = hostnameOf(url);
  await hostLimiter.acquire(host);
  try {
    return await fetch(url, {
      method: opts.method ?? "GET",
      headers: { "user-agent": UA, accept: "*/*", ...opts.headers },
      body: opts.body,
      signal,
      redirect: opts.redirect ?? "follow",
      // Skip Next.js data cache. Provider responses are per-request and
      // logging "Failed to set fetch cache ... provider timeout" is noise.
      cache: "no-store",
    });
  } finally {
    clearTimeout(t);
    hostLimiter.release(host);
  }
}

function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") return anyFn([a, b]);
  const ctrl = new AbortController();
  const onAbort = (): void => ctrl.abort();
  a.addEventListener("abort", onAbort);
  b.addEventListener("abort", onAbort);
  return ctrl.signal;
}

export function encode(s: string): string {
  return encodeURIComponent(s);
}
