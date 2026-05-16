import { NextResponse } from "next/server";
import { runCheck } from "@starter/shared";
import { diffSummaries, hasMeaningfulChange } from "@starter/shared/notify/diff";
import { buildDiffEmail, renderMarkdown } from "@starter/shared/notify/email";
import { sendMail } from "@/lib/mailer";
import {
  getUserEmail,
  listStaleWatches,
  updateWatchSummary,
} from "@/lib/watch-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STALE_AFTER_MS = 23 * 60 * 60 * 1000;

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const stale = listStaleWatches(STALE_AFTER_MS);

  const report: Array<{
    id: string;
    query: string;
    changed: number;
    emailSent: boolean;
    reason?: string;
  }> = [];

  for (const watch of stale) {
    const next = await runCheck({
      query: watch.query,
      categories: watch.categories ?? undefined,
      providers: watch.providers ?? undefined,
    });
    const diff = diffSummaries(watch.lastSummary, next);
    updateWatchSummary(watch.id, next);

    if (!hasMeaningfulChange(diff)) {
      report.push({ id: watch.id, query: watch.query, changed: 0, emailSent: false });
      continue;
    }

    const total = diff.gained.length + diff.lost.length;
    const msg = buildDiffEmail(watch.query, diff);
    if (!msg) {
      report.push({ id: watch.id, query: watch.query, changed: total, emailSent: false });
      continue;
    }

    const email = getUserEmail(watch.userId);
    if (!email) {
      console.log(
        `[cron/watch] ${watch.query}: no email for user ${watch.userId}. body:\n${renderMarkdown(watch.query, diff)}`,
      );
      report.push({
        id: watch.id,
        query: watch.query,
        changed: total,
        emailSent: false,
        reason: "no_recipient",
      });
      continue;
    }

    try {
      await sendMail({
        to: email,
        subject: msg.subject,
        text: msg.text,
      });
      report.push({ id: watch.id, query: watch.query, changed: total, emailSent: true });
    } catch (err) {
      console.log(
        `[cron/watch] ${watch.query}: sendMail failed (${err instanceof Error ? err.message : String(err)}). body:\n${renderMarkdown(watch.query, diff)}`,
      );
      report.push({
        id: watch.id,
        query: watch.query,
        changed: total,
        emailSent: false,
        reason: "error",
      });
    }
  }

  return NextResponse.json({ ok: true, processed: stale.length, report });
}
