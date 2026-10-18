import { suggestVariants } from "@starter/shared";
import { checkRateLimit, getClientIp } from "../lib/rate-limit-cache";

const MAX_COUNT = 50;

export async function GET(req: Request): Promise<Response> {
  const rl = checkRateLimit(getClientIp(req));
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      },
    );
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return Response.json({ error: "missing q" }, { status: 400 });
  }
  const nRaw = Number(url.searchParams.get("n") ?? "20");
  const n = Number.isFinite(nRaw)
    ? Math.max(1, Math.min(MAX_COUNT, Math.floor(nRaw)))
    : 20;
  const includeMutations = url.searchParams.get("mutations") === "1";
  const includeCompounds = url.searchParams.get("compounds") !== "0";

  const suggestions = suggestVariants(q, {
    count: n,
    includeMutations,
    includeCompounds,
  });

  return Response.json(
    { query: q, suggestions },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
