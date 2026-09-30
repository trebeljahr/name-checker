import { passportOrigin } from "@/lib/passport-runtime";
import { NextResponse } from "next/server";
import {
  githubAuthorizeUrl,
  githubSoftFallbackUrl,
} from "@starter/shared/passport/github";
import { readPassportSession } from "@/lib/passport-session";
import {
  createOAuthSession,
  getReservation,
  setStatus,
} from "@/lib/passport-store";
import { readPlanGate, requireQuery } from "@/lib/passport-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type StartBody = { query?: unknown; redirectOrigin?: unknown };

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
  let body: StartBody;
  try {
    body = (await req.json()) as StartBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const query = requireQuery(body.query);
  if (!query) {
    return NextResponse.json({ error: "invalid query" }, { status: 400 });
  }
  if (body.redirectOrigin !== undefined && body.redirectOrigin !== origin) {
    return NextResponse.json({ error: "invalid_redirect" }, { status: 400 });
  }
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    const existing = await getReservation(session.userId, query, "github");
    const fallback = githubSoftFallbackUrl(query);
    const updated = await setStatus({
      userId: session.userId,
      query,
      platform: "github",
      status: "failed",
      fallbackUrl: fallback,
      failureCode: "soft_fallback",
      failureDetail:
        "GITHUB_OAUTH_CLIENT_ID not configured; using soft-tier-1 fallback link",
      externalId: existing?.externalId ?? null,
      url: existing?.url ?? null,
    });
    return NextResponse.json({
      mode: "soft_fallback",
      authorizeUrl: null,
      fallbackUrl: fallback,
      reservation: updated,
    });
  }
  const state = await createOAuthSession({
    userId: session.userId,
    query,
    platform: "github",
    redirectUri: `${origin}/api/passport/callback/github`,
  });
  const callbackUri = `${origin}/api/passport/callback/github`;
  const authorizeUrl = githubAuthorizeUrl({
    clientId,
    redirectUri: callbackUri,
    state,
  });
  const updated = await setStatus({
    userId: session.userId,
    query,
    platform: "github",
    status: "connecting",
  });
  return NextResponse.json({
    mode: "oauth",
    authorizeUrl,
    fallbackUrl: githubSoftFallbackUrl(query),
    reservation: updated,
  });
}
