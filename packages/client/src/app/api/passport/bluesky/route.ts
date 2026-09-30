import { passportOrigin } from "@/lib/passport-runtime";
import { NextResponse } from "next/server";
import {
  blueskyFullHandle,
  createBlueskyAccount,
  generateBlueskyPassword,
} from "@starter/shared/passport/bluesky";
import { readPassportSession } from "@/lib/passport-session";
import {
  persistError,
  persistResult,
  readPlanGate,
  requireQuery,
} from "@/lib/passport-runtime";
import { setStatus } from "@/lib/passport-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  query?: unknown;
  email?: unknown;
  password?: unknown;
  inviteCode?: unknown;
};

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
  const email =
    (typeof body.email === "string" && body.email.trim()) ||
    process.env.BLUESKY_RESERVATION_EMAIL ||
    "";
  if (!email) {
    const persisted = await persistError({
      userId: session.userId,
      query,
      platform: "bluesky",
      failureCode: "missing_credentials",
      detail:
        "no email available — provide one in the UI or set BLUESKY_RESERVATION_EMAIL",
      fallbackUrl: `https://bsky.app/profile/${blueskyFullHandle(query)}`,
    });
    return NextResponse.json(persisted, { status: 400 });
  }
  const password =
    (typeof body.password === "string" && body.password) ||
    generateBlueskyPassword();
  const inviteCode =
    typeof body.inviteCode === "string" && body.inviteCode
      ? body.inviteCode
      : process.env.BLUESKY_INVITE_CODE || undefined;
  await setStatus({
    userId: session.userId,
    query,
    platform: "bluesky",
    status: "reserving",
  });
  const result = await createBlueskyAccount({
    query,
    email,
    password,
    inviteCode,
  }).catch((err) => ({
    ok: false as const,
    platform: "bluesky" as const,
    failureCode: "network_error" as const,
    detail: err instanceof Error ? err.message : "bluesky call failed",
  }));
  const persisted = await persistResult({
    userId: session.userId,
    query,
    platform: "bluesky",
    result,
  });
  const responseBody = {
    ...persisted,
    handle: blueskyFullHandle(query),
    password: result.ok ? password : null,
  };
  return NextResponse.json(responseBody, {
    status: persisted.ok ? 200 : 400,
  });
}
