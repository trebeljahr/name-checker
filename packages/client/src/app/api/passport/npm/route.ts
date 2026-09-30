import { passportOrigin } from "@/lib/passport-runtime";
import { NextResponse } from "next/server";
import {
  createNpmScopeReservation,
  emptyPlaceholderTarball,
  npmScope,
} from "@starter/shared/passport/npm";
import { readPassportSession } from "@/lib/passport-session";
import {
  persistError,
  persistResult,
  readPlanGate,
  requireQuery,
} from "@/lib/passport-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = { query?: unknown; token?: unknown };

export async function POST(req: Request): Promise<Response> {
  const session = await readPassportSession(req);
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const gate = readPlanGate(session.plan);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "plan_gate", detail: gate.reason },
      { status: 402 },
    );
  }
  const origin = passportOrigin();
  if (!origin) return NextResponse.json({ error: "passport_not_configured" }, { status: 503 });
  if (req.headers.get("origin") !== origin) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const query = requireQuery(body.query);
  if (!query) {
    return NextResponse.json({ error: "invalid query" }, { status: 400 });
  }
  const npmToken =
    (typeof body.token === "string" && body.token.trim()) ||
    "";
  if (!npmToken) {
    const persisted = await persistError({
      userId: session.userId,
      query,
      platform: "npm",
      failureCode: "missing_credentials",
      detail:
        "no npm token available — paste your own token in the UI",
      fallbackUrl: `https://www.npmjs.com/signup?next=/org/create?orgname=${encodeURIComponent(npmScope(query))}`,
    });
    return NextResponse.json(persisted, { status: 400 });
  }
  const username = process.env.NPM_USERNAME ?? "name-check";
  const email = process.env.NPM_EMAIL ?? "name-check@example.com";
  const result = await createNpmScopeReservation({
    npmToken,
    query,
    username,
    email,
    tarball: emptyPlaceholderTarball(),
  }).catch((err) => ({
    ok: false as const,
    platform: "npm" as const,
    failureCode: "network_error" as const,
    detail: err instanceof Error ? err.message : "npm call failed",
  }));
  const persisted = await persistResult({
    userId: session.userId,
    query,
    platform: "npm",
    result,
  });
  return NextResponse.json(persisted, { status: persisted.ok ? 200 : 400 });
}
