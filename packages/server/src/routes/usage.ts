import { createHash, timingSafeEqual } from "node:crypto";
import { getDb } from "../lib/db";
import { createProviderCallCounter } from "../lib/provider-calls";

const DEFAULT_DAYS = 30;
const MAX_DAYS = 366;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Provider calls per day, for the operator: what checks cost. Aggregate
 * counts only. `Authorization: Bearer $USAGE_REPORT_TOKEN`; `?days=` picks
 * how many days back (default 30).
 */
export async function GET(req: Request): Promise<Response> {
  const token = process.env.USAGE_REPORT_TOKEN;
  if (!token)
    return Response.json(
      { error: "USAGE_REPORT_TOKEN not configured" },
      { status: 503 },
    );
  const sent = req.headers.get("authorization") ?? "";
  if (!timingSafeEqual(digest(sent), digest(`Bearer ${token}`)))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const asked = Number(new URL(req.url).searchParams.get("days") ?? DEFAULT_DAYS);
  const days =
    Number.isInteger(asked) && asked >= 1 ? Math.min(asked, MAX_DAYS) : DEFAULT_DAYS;
  return Response.json(
    { days: createProviderCallCounter(getDb()).report(days) },
    { headers: { "cache-control": "no-store" } },
  );
}
