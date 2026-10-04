import {
  allProviders,
  runCheckWithProviders,
  selectProviders,
  safeQuery,
  type CheckRequest,
  type CheckSummary,
  type Provider,
  type ProviderResult,
} from "@starter/shared";
import {
  CheckJobError,
  type CheckJob,
  type createCheckJobStore,
} from "./check-jobs";

type Store = ReturnType<typeof createCheckJobStore>;
type Input = Omit<CheckRequest, "query"> & {
  query?: string;
  queries?: string[];
  batchConcurrency?: number;
};
type Descriptor = Pick<Provider, "id" | "name" | "category">;

/** The lease owns durable writes; provider requests themselves are read-only. */
export async function runCheckJob(
  store: Store,
  job: CheckJob,
  worker: string,
  signal: AbortSignal,
  catalog: Provider[] = allProviders,
): Promise<void> {
  const input = JSON.parse(job.payload!) as Input;
  const queries = (job.kind === "single" ? [input.query!] : input.queries!).map(
    safeQuery,
  );
  const descriptors = store.saved(job.id, worker, "providers") as
    | Descriptor[]
    | null;
  const providers = descriptors
    ? descriptors.map((d) => catalog.find((p) => p.id === d.id))
    : catalog === allProviders
      ? selectProviders({ ...input, query: queries[0]! })
      : catalog.filter(
          (p) =>
            (!input.providers || input.providers.includes(p.id)) &&
            (!input.excludeProviders ||
              !input.excludeProviders.includes(p.id)) &&
            (!input.categories || input.categories.includes(p.category)),
        );
  // A newer release may add a provider the retiring replica cannot run.
  // Leave the receipt pending for a compatible replica; never silently omit it.
  if (providers.some((p) => !p))
    throw new CheckJobError("job_requires_newer_release", 409);
  const selected = providers as Provider[];
  const send = (
    key: string,
    event: string,
    data: unknown,
    done = false,
  ): void => {
    signal.throwIfAborted();
    store.append(job.id, worker, key, event, data, done);
  };
  send(
    "providers",
    "providers",
    selected.map(({ id, name, category }) => ({ id, name, category })),
  );
  send(
    "start",
    job.kind === "bulk" ? "batch_start" : "start",
    job.kind === "single"
      ? { query: queries[0] }
      : {
          queries,
          count: queries.length,
          providers: selected.map(({ id, name, category }) => ({
            id,
            name,
            category,
          })),
        },
  );
  const summaries: CheckSummary[] = new Array(queries.length);
  let cursor = 0;
  const check = async (): Promise<void> => {
    while (true) {
      signal.throwIfAborted();
      const index = cursor++;
      if (index >= queries.length) return;
      const query = queries[index]!;
      const summaryKey = `summary:${index}`;
      const previous = store.saved(
        job.id,
        worker,
        summaryKey,
      ) as CheckSummary | null;
      if (previous) {
        summaries[index] = previous;
        continue;
      }
      send(`query:${index}`, "query_start", { query, index });
      const priorResults = selected.flatMap((p) => {
        const result = store.saved(
          job.id,
          worker,
          `saved:${index}:${p.id}`,
        ) as ProviderResult | null;
        return result ? [result] : [];
      });
      const summary = await runCheckWithProviders(
        selected,
        { ...input, query },
        (result) => {
          // Save once, then publish. Both rows are fenced, and replay fills the
          // publication gap if a process dies between these two SQLite commits.
          send(`saved:${index}:${result.providerId}`, "saved_result", result);
          send(
            `result:${index}:${result.providerId}`,
            "result",
            job.kind === "compare" ? { query, index, result } : result,
          );
        },
        { signal, priorResults },
      );
      for (const result of summary.results) {
        send(
          `result:${index}:${result.providerId}`,
          "result",
          job.kind === "compare" ? { query, index, result } : result,
        );
      }
      send(summaryKey, "saved_summary", summary);
      summaries[index] = summary;
      send(
        `query_done:${index}`,
        "query_done",
        job.kind === "compare" ? { query, index, summary } : summary,
      );
    }
  };
  await Promise.all(
    Array.from(
      {
        length: Math.min(
          job.kind === "compare" ? (input.batchConcurrency ?? 4) : 1,
          queries.length,
        ),
      },
      check,
    ),
  );
  // Re-publish all completed query summaries, including a crash between save
  // and publication. Unique event keys make this safe across worker takeover.
  summaries.forEach((summary, index) =>
    send(
      `query_done:${index}`,
      "query_done",
      job.kind === "compare"
        ? { query: queries[index], index, summary }
        : summary,
    ),
  );
  send(
    "done",
    "done",
    job.kind === "single"
      ? summaries[0]
      : job.kind === "compare"
        ? { queries, results: summaries }
        : { count: queries.length, totalMs: Date.now() - job.created_at },
    true,
  );
}

export function startCheckJob(
  store: Store,
  job: CheckJob,
  signal: AbortSignal,
  draining: () => boolean = () => process.env.HATCHKIT_DRAINING === "1",
  catalog?: Provider[],
): Promise<void> {
  if (draining() || signal.aborted) return Promise.resolve();
  const worker = store.claim(job.id);
  if (!worker) return Promise.resolve();
  const controller = new AbortController();
  const abort = (): void => controller.abort(new Error("check interrupted"));
  signal.addEventListener("abort", abort, { once: true });
  const renewal = setInterval(() => {
    try {
      if (draining() || !store.renew(job.id, worker)) abort();
    } catch {
      abort();
    }
  }, 500);
  return runCheckJob(store, job, worker, controller.signal, catalog)
    .catch(() => {
      abort(); /* Keep the durable receipt resumable; never log private queries. */
    })
    .finally(() => {
      clearInterval(renewal);
      signal.removeEventListener("abort", abort);
      store.release(job.id, worker);
    });
}
