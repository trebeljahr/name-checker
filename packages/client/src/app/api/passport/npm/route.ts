import { NextResponse } from "next/server";
import {
  createNpmScopeReservation,
  emptyPlaceholderTarball,
  npmScope,
} from "@starter/shared/passport/npm";
import { getOrCreatePassportSession } from "@/lib/passport-session";
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
  const session = await getOrCreatePassportSession();
  const gate = readPlanGate(session.plan);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "plan_gate", detail: gate.reason },
      { status: 402 },
    );
  }
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
    process.env.NPM_TOKEN ||
    "";
  if (!npmToken) {
    const persisted = await persistError({
      userId: session.userId,
      query,
      platform: "npm",
      failureCode: "missing_credentials",
      detail:
        "no npm token available — set NPM_TOKEN on the server or paste a token in the UI",
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
