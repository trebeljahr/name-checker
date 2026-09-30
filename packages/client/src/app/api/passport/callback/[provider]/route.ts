import { readPassportSession } from "@/lib/passport-session";
import { passportOrigin, readPlanGate } from "@/lib/passport-runtime";
import { NextResponse } from "next/server";
import {
  createGithubOrg,
  exchangeGithubCode,
  githubSoftFallbackUrl,
} from "@starter/shared/passport/github";
import { consumeOAuthSession } from "@/lib/passport-store";
import { persistError, persistResult } from "@/lib/passport-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function passportRedirect(origin: string, query: string, hash: string): Response {
  const url = `${origin}/passport/${encodeURIComponent(query)}${hash}`;
  return NextResponse.redirect(url, { status: 302 });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await ctx.params;
  const url = new URL(req.url);
  const identity = await readPassportSession(req);
  if (!identity) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!readPlanGate(identity.plan).allowed) return NextResponse.json({ error: "plan_gate" }, { status: 402 });
  const origin = passportOrigin();
  if (!origin || url.origin !== origin) return NextResponse.json({ error: "passport_not_configured" }, { status: 503 });
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");

  if (provider !== "github") {
    return NextResponse.json(
      { error: "unsupported provider", provider },
      { status: 400 },
    );
  }
  if (!state) {
    return NextResponse.json({ error: "missing state" }, { status: 400 });
  }
  const session = await consumeOAuthSession(state, identity.userId, "github", `${origin}/api/passport/callback/github`);
  if (!session) {
    return NextResponse.json(
      { error: "invalid or expired oauth state" },
      { status: 400 },
    );
  }
  if (errParam || !code) {
    await persistError({
      userId: session.userId,
      query: session.query,
      platform: "github",
      failureCode: "soft_fallback",
      detail: errParam ?? "missing code",
      fallbackUrl: githubSoftFallbackUrl(session.query),
    });
    return passportRedirect(origin, session.query, "#github=failed");
  }
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    await persistError({
      userId: session.userId,
      query: session.query,
      platform: "github",
      failureCode: "missing_credentials",
      detail: "github oauth credentials are not configured on the server",
      fallbackUrl: githubSoftFallbackUrl(session.query),
    });
    return passportRedirect(origin, session.query, "#github=failed");
  }
  let accessToken: string;
  try {
    const exchange = await exchangeGithubCode({
      clientId,
      clientSecret,
      code,
      redirectUri: session.redirectUri,
    });
    accessToken = exchange.accessToken;
  } catch (err) {
    await persistError({
      userId: session.userId,
      query: session.query,
      platform: "github",
      failureCode: "network_error",
      detail: err instanceof Error ? err.message : "github code exchange failed",
      fallbackUrl: githubSoftFallbackUrl(session.query),
    });
    return passportRedirect(origin, session.query, "#github=failed");
  }
  const me = await fetch("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/vnd.github+json",
    },
  })
    .then((r) => (r.ok ? (r.json() as Promise<{ login?: string }>) : null))
    .catch(() => null);
  const adminUsername = me?.login ?? "";
  if (!adminUsername) {
    await persistError({
      userId: session.userId,
      query: session.query,
      platform: "github",
      failureCode: "insufficient_perms",
      detail: "could not resolve github user from access token",
      fallbackUrl: githubSoftFallbackUrl(session.query),
    });
    return passportRedirect(origin, session.query, "#github=failed");
  }
  const result = await createGithubOrg({
    accessToken,
    login: session.query,
    adminUsername,
  }).catch((err) => ({
    ok: false as const,
    platform: "github" as const,
    failureCode: "network_error" as const,
    detail: err instanceof Error ? err.message : "github org create failed",
  }));
  const persisted = await persistResult({
    userId: session.userId,
    query: session.query,
    platform: "github",
    result,
  });
  const hash = persisted.ok ? "#github=reserved" : "#github=failed";
  return passportRedirect(origin, session.query, hash);
}
