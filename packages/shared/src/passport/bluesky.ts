import { fetchWithTimeout } from "../http.js";
import { handle as normalizeHandle } from "../normalize.js";
import type { AvailabilityResult, ReservationResult } from "./types.js";

const BSKY_PDS = "https://bsky.social";
const BSKY_APPVIEW = "https://public.api.bsky.app";

export function blueskyHandle(query: string): string {
  return normalizeHandle(query).slice(0, 18);
}

export function blueskyFullHandle(query: string): string {
  return `${blueskyHandle(query)}.bsky.social`;
}

export async function checkBlueskyHandleAvailability(
  query: string,
  signal?: AbortSignal,
): Promise<AvailabilityResult> {
  const full = blueskyFullHandle(query);
  const res = await fetchWithTimeout(
    `${BSKY_APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(full)}`,
    {
      method: "GET",
      timeoutMs: 8_000,
      signal,
      headers: { accept: "application/json" },
    },
  );
  if (res.status === 400 || res.status === 404) {
    return { available: true, detail: `${full} not resolvable` };
  }
  if (res.status === 200) {
    return { available: false, detail: `${full} already resolves to a DID` };
  }
  return {
    available: false,
    detail: `bluesky resolve returned status ${res.status}`,
  };
}

export async function createBlueskyAccount(opts: {
  query: string;
  email: string;
  password: string;
  inviteCode?: string;
  signal?: AbortSignal;
}): Promise<ReservationResult> {
  const full = blueskyFullHandle(opts.query);
  const availability = await checkBlueskyHandleAvailability(opts.query, opts.signal);
  if (!availability.available) {
    return {
      ok: false,
      platform: "bluesky",
      failureCode: "name_taken",
      detail: availability.detail,
      fallbackUrl: `https://bsky.app/profile/${full}`,
    };
  }
  const body: Record<string, unknown> = {
    handle: full,
    email: opts.email,
    password: opts.password,
  };
  if (opts.inviteCode) body.inviteCode = opts.inviteCode;
  const res = await fetchWithTimeout(
    `${BSKY_PDS}/xrpc/com.atproto.server.createAccount`,
    {
      method: "POST",
      timeoutMs: 20_000,
      signal: opts.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (res.status === 200) {
    const json = (await res.json()) as { did?: string; handle?: string };
    return {
      ok: true,
      platform: "bluesky",
      externalId: json.did ?? full,
      url: `https://bsky.app/profile/${json.handle ?? full}`,
    };
  }
  const errBody = await res.json().catch(() => ({}) as Record<string, unknown>);
  const errName =
    typeof (errBody as { error?: unknown }).error === "string"
      ? ((errBody as { error: string }).error as string)
      : "";
  const errMsg =
    typeof (errBody as { message?: unknown }).message === "string"
      ? ((errBody as { message: string }).message as string)
      : "";
  if (errName === "HandleNotAvailable" || /handle/i.test(errMsg + errName)) {
    return {
      ok: false,
      platform: "bluesky",
      failureCode: "name_taken",
      detail: errMsg || `bluesky reports handle ${full} unavailable`,
    };
  }
  if (errName === "InvalidInviteCode" || errName === "InviteCodeRequired") {
    return {
      ok: false,
      platform: "bluesky",
      failureCode: "missing_credentials",
      detail: errMsg || "bluesky requires an invite code",
    };
  }
  if (res.status === 429) {
    return {
      ok: false,
      platform: "bluesky",
      failureCode: "rate_limited",
      detail: "bluesky rate limit hit",
    };
  }
  return {
    ok: false,
    platform: "bluesky",
    failureCode: "unknown",
    detail: `bluesky createAccount returned ${res.status}: ${errMsg || errName || "no detail"}`,
  };
}

export function generateBlueskyPassword(rng: () => number = Math.random): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += alphabet[Math.floor(rng() * alphabet.length)];
  }
  return out;
}
