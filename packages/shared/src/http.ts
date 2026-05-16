const UA = "name-checker/0.1 (+https://github.com/ricotrebeljahr/name-checker)";

export type FetchOpts = {
  signal?: AbortSignal;
  timeoutMs?: number;
  method?: "GET" | "HEAD" | "POST";
  headers?: Record<string, string>;
  body?: string;
  redirect?: "follow" | "manual" | "error";
};

export async function fetchWithTimeout(
  url: string,
  opts: FetchOpts = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);
  const signal = opts.signal ? mergeSignals(opts.signal, ctrl.signal) : ctrl.signal;
  try {
    return await fetch(url, {
      method: opts.method ?? "GET",
      headers: { "user-agent": UA, accept: "*/*", ...opts.headers },
      body: opts.body,
      signal,
      redirect: opts.redirect ?? "follow",
    });
  } finally {
    clearTimeout(t);
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
