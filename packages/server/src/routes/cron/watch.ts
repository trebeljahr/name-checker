import { getDb } from "../../lib/db";
import { createWatchJobStore } from "../../lib/watch-jobs";
import { runWatchBatch } from "../../lib/watch-job-worker";
import { sendMail } from "../../lib/mailer";

const STALE_AFTER_MS = 23 * 60 * 60 * 1000;

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return Response.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  if (req.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.HATCHKIT_DRAINING === "1")
    return Response.json(
      { error: "draining" },
      { status: 503, headers: { "Retry-After": "2" } },
    );
  const store = createWatchJobStore(getDb());
  const scheduled = store.reserveDue(STALE_AFTER_MS);
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(20_000)]);
  const report = await runWatchBatch(store, signal, sendMail);
  // No query, recipient, provider response, or email body is included in logs
  // or the scheduler response. Uncertain deliveries need operator review.
  return Response.json({
    ok: true,
    scheduled,
    processed: report.length,
    heldDeliveries: store.heldCount(),
    report,
  });
}
