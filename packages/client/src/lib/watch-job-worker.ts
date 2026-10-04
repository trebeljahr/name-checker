import { performance } from "node:perf_hooks";
import {
  allProviders,
  runCheckWithProviders,
  selectProviders,
  type Provider,
} from "@starter/shared";
import { diffSummaries } from "@starter/shared/notify/diff";
import { buildDiffEmail } from "@starter/shared/notify/email";
import { MailDeliveryError } from "./mail-delivery";
import {
  WATCH_LEASE_MS,
  type WatchJobStore,
  type WatchMessage,
  type WatchRun,
} from "./watch-jobs";

export type WatchSender = (
  message: WatchMessage,
  options: { signal: AbortSignal },
) => Promise<void>;
export type WatchReport = {
  id: string;
  state: string;
  changed: number;
  reason?: string;
};

export async function runWatchJob(
  store: WatchJobStore,
  run: WatchRun,
  signal: AbortSignal,
  send: WatchSender,
  options: { catalog?: Provider[]; draining?: () => boolean } = {},
): Promise<WatchReport> {
  const draining =
    options.draining ?? (() => process.env.HATCHKIT_DRAINING === "1");
  const report = (): WatchReport => {
    const current = store.inspect(run.id);
    return {
      id: run.id,
      state: current?.phase ?? "deleted",
      changed: current?.changed ?? 0,
      ...(current?.reason ? { reason: current.reason } : {}),
    };
  };
  if (draining() || signal.aborted) return report();
  const worker = store.claim(run.id);
  if (!worker) return report();
  const controller = new AbortController();
  const abort = (): void => controller.abort(new Error("Watch interrupted"));
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  let deadline = performance.now() + WATCH_LEASE_MS;
  const renewal = setInterval(() => {
    try {
      if (
        draining() ||
        performance.now() >= deadline ||
        !store.renew(run.id, worker)
      )
        abort();
      else deadline = performance.now() + WATCH_LEASE_MS;
    } catch {
      abort();
    }
  }, 250);
  const check = (): void => {
    if (draining() || performance.now() >= deadline) abort();
    controller.signal.throwIfAborted();
  };
  try {
    let current = store.current(run.id, worker);
    if (current.phase === "checking") {
      const input = {
        query: current.watch.query,
        categories: current.watch.categories ?? undefined,
        providers: current.watch.providers ?? undefined,
      };
      const catalog = options.catalog ?? allProviders;
      const selected = current.providers
        ? current.providers.map((p) =>
            catalog.find((entry) => entry.id === p.id),
          )
        : options.catalog
          ? catalog.filter(
              (p) =>
                (!input.categories || input.categories.includes(p.category)) &&
                (!input.providers || input.providers.includes(p.id)),
            )
          : selectProviders(input);
      if (selected.some((p) => !p)) {
        store.release(run.id, worker, "requires_newer_release");
        return report();
      }
      const providers = selected as Provider[];
      store.providers(
        run.id,
        worker,
        providers.map(({ id, name, category }) => ({ id, name, category })),
      );
      const next = await runCheckWithProviders(
        providers,
        input,
        (result) => {
          check();
          store.saveResult(run.id, worker, result);
        },
        {
          signal: controller.signal,
          priorResults: store.results(run.id, worker),
        },
      );
      check();
      const diff = diffSummaries(current.watch.lastSummary, next);
      const message = buildDiffEmail(current.watch.query, diff);
      store.prepare(
        run.id,
        worker,
        next,
        message ? { subject: message.subject, text: message.text } : null,
        diff.gained.length + diff.lost.length,
      );
      current = store.inspect(run.id)!;
    }
    if (current.phase === "pending") {
      check();
      const message = store.beginDelivery(run.id, worker);
      if (!message) return report();
      try {
        // The durable 'sending' intent is committed before external I/O.
        await send(message, { signal: controller.signal });
        store.delivery(run.id, worker, "sent");
      } catch (error) {
        store.delivery(
          run.id,
          worker,
          error instanceof MailDeliveryError && error.outcome === "not_sent"
            ? "not_sent"
            : "uncertain",
        );
      }
    }
  } catch {
    // Keep checkpoints and uncertain mail state. Never log queries, recipients,
    // provider response bodies, or email content from exceptions.
  } finally {
    clearInterval(renewal);
    signal.removeEventListener("abort", abort);
    store.release(run.id, worker);
  }
  return report();
}

export async function runWatchBatch(
  store: WatchJobStore,
  signal: AbortSignal,
  send: WatchSender,
  options: { catalog?: Provider[]; draining?: () => boolean } = {},
): Promise<WatchReport[]> {
  const reports: WatchReport[] = [];
  for (const run of store.runnable(10)) {
    if (
      signal.aborted ||
      (options.draining?.() ?? process.env.HATCHKIT_DRAINING === "1")
    )
      break;
    reports.push(await runWatchJob(store, run, signal, send, options));
  }
  return reports;
}
