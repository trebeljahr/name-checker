export type CheckKind = "single" | "compare" | "bulk";
export type PendingCheck = {
  version: 1;
  operationId: string;
  owner: string;
  kind: CheckKind;
  input: unknown;
};
export type CheckMessage = { event: string; data: unknown };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const key = (kind: CheckKind, owner: string): string =>
  `name-check:pending:v1:${kind}:${owner}`;

export function readPendingCheck(
  storage: Storage,
  kind: CheckKind,
  owner: string,
): PendingCheck | null {
  const value = storage.getItem(key(kind, owner));
  if (!value) return null;
  const pending = JSON.parse(value) as PendingCheck;
  const input = pending.input as Record<string, unknown> | null;
  if (
    pending.version !== 1 ||
    pending.kind !== kind ||
    pending.owner !== owner ||
    !input ||
    typeof input !== "object" ||
    (kind === "single"
      ? typeof input.query !== "string"
      : !Array.isArray(input.queries) ||
        !input.queries.every((query) => typeof query === "string")) ||
    (input.categories !== undefined &&
      (!Array.isArray(input.categories) ||
        !input.categories.every((category) => typeof category === "string"))) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      pending.operationId,
    )
  ) {
    throw new Error(
      "The saved check cannot be read. Dismiss it before starting another check.",
    );
  }
  return pending;
}

export function dismissPendingCheck(
  storage: Storage,
  kind: CheckKind,
  owner: string,
): void {
  storage.removeItem(key(kind, owner));
}

export function prepareCheck(
  storage: Storage,
  kind: CheckKind,
  owner: string,
  input: unknown,
): PendingCheck {
  const previous = readPendingCheck(storage, kind, owner);
  if (previous) {
    if (JSON.stringify(previous.input) !== JSON.stringify(input)) {
      throw new Error(
        "A previous check is unfinished. Resume or dismiss it before starting a different check.",
      );
    }
    return previous;
  }
  const pending: PendingCheck = {
    version: 1,
    operationId: crypto.randomUUID(),
    owner,
    kind,
    input,
  };
  // Storage failure is a hard boundary: no request can be sent without its ID.
  storage.setItem(key(kind, owner), JSON.stringify(pending));
  return pending;
}

class CheckResponseError extends Error {}

export async function streamCheckJob(
  pending: PendingCheck,
  storage: Storage,
  onMessage: (message: CheckMessage) => void,
  signal: AbortSignal,
  options: {
    fetch?: typeof fetch;
    retryMs?: number;
    maxRetries?: number;
    idleMs?: number;
  } = {},
): Promise<void> {
  const fetcher = options.fetch ?? fetch;
  let after = 0;
  let failures = 0;
  while (true) {
    signal.throwIfAborted();
    const attempt = new AbortController();
    const abort = (): void => attempt.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    let idle: ReturnType<typeof setTimeout> | undefined;
    const arm = (): void => {
      clearTimeout(idle);
      idle = setTimeout(
        () => attempt.abort(new Error("check stream idle")),
        options.idleMs ?? 20_000,
      );
    };
    arm();
    try {
      const response = await fetcher("/api/check/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...pending, after }),
        signal: attempt.signal,
      });
      if ([400, 401, 402, 409, 410, 429].includes(response.status)) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        const messages: Record<string, string> = {
          free_limit_size: "Free plan allows up to 5 names per bulk check.",
          free_limit_runs: "Free plan allows 10 bulk checks per day.",
          session_changed:
            "Your sign-in changed. Sign in with the original account to resume.",
          unauthenticated: "Sign in to run bulk checks.",
          job_expired:
            "This saved check has expired. Dismiss it to start a new one.",
          rate_limited: "Too many checks. Try again later.",
        };
        // These statuses confirm no receipt exists; authentication/conflict/
        // expiry remain pending and must never create a replacement silently.
        if ([400, 402, 429].includes(response.status))
          dismissPendingCheck(storage, pending.kind, pending.owner);
        throw new CheckResponseError(
          messages[body.error ?? ""] ??
            "This check cannot continue. Resume it later or dismiss it.",
        );
      }
      // A legacy replica cannot acknowledge this protocol. Retry the same ID.
      if (
        !response.ok ||
        !response.body ||
        response.headers.get("x-check-jobs-protocol") !== "1"
      )
        throw new Error("check service unavailable");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        let reconnect = false;
        while (!reconnect) {
          const { value, done } = await reader.read();
          if (done) break;
          arm();
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            const lines = block.split("\n");
            const event = lines
              .find((line) => line.startsWith("event:"))
              ?.slice(6)
              .trim();
            const raw = lines
              .find((line) => line.startsWith("data:"))
              ?.slice(5)
              .trim();
            if (!event || !raw) continue;
            const sequence = Number(
              lines
                .find((line) => line.startsWith("id:"))
                ?.slice(3)
                .trim() ?? 0,
            );
            if (sequence && sequence <= after) continue;
            const data: unknown = JSON.parse(raw);
            if (event === "error")
              throw new CheckResponseError(
                (data as { message: string }).message,
              );
            if (event === "reconnect") {
              reconnect = true;
              break;
            }
            if (sequence) {
              onMessage({ event, data });
              after = sequence;
              failures = 0;
            }
            if (event === "done") {
              if (
                readPendingCheck(storage, pending.kind, pending.owner)
                  ?.operationId === pending.operationId
              ) {
                dismissPendingCheck(storage, pending.kind, pending.owner);
              }
              return;
            }
          }
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof CheckResponseError) throw error;
    } finally {
      clearTimeout(idle);
      signal.removeEventListener("abort", abort);
      attempt.abort();
    }
    if (++failures > (options.maxRetries ?? 40)) {
      throw new Error(
        "Connection interrupted. Your check is saved; use Resume check to continue without another run.",
      );
    }
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void =>
        signal.removeEventListener("abort", cancelled);
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, options.retryMs ?? 1000);
      const cancelled = (): void => {
        clearTimeout(timer);
        cleanup();
        reject(signal.reason);
      };
      signal.addEventListener("abort", cancelled, { once: true });
      if (signal.aborted) cancelled();
    });
  }
}
