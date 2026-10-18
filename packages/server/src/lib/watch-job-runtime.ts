import { getDb } from "./db";
import { createWatchJobStore } from "./watch-jobs";
import { runWatchBatch } from "./watch-job-worker";
import { sendMail } from "./mailer";

type Recovery = { stop: () => Promise<void> };
const runtime = globalThis as typeof globalThis & {
  __watchRecovery?: Recovery;
};

/** Startup resumes existing cron receipts only; fresh watches require cron authorization. */
export function startWatchRecovery(): Recovery {
  if (runtime.__watchRecovery) return runtime.__watchRecovery;
  let stopped = false;
  let active: Promise<unknown> | undefined;
  let controller: AbortController | undefined;
  const store = createWatchJobStore(getDb());
  const scan = (): void => {
    if (stopped || active || process.env.HATCHKIT_DRAINING === "1") return;
    controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(20_000),
    ]);
    active = runWatchBatch(store, signal, sendMail)
      .catch(() => undefined)
      .finally(() => {
        active = undefined;
        controller = undefined;
      });
  };
  const timer = setInterval(scan, 5_000);
  const drain = setInterval(() => {
    if (process.env.HATCHKIT_DRAINING === "1") void stop();
  }, 100);
  timer.unref();
  drain.unref();
  async function stop(): Promise<void> {
    stopped = true;
    clearInterval(timer);
    clearInterval(drain);
    controller?.abort(new Error("Watch runtime draining"));
    await active;
  }
  const recovery = { stop };
  runtime.__watchRecovery = recovery;
  scan();
  return recovery;
}
