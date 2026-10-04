import type {
  PassportPlatform,
  Reservation,
  ReservationFailureCode,
  ReservationResult,
} from "@starter/shared";
import { NextResponse } from "next/server";
import { type AttemptRef, PassportAttemptError, finishAttempt, setStatus } from "./passport-store";

export const GITHUB_USER_TIMEOUT_MS = 10_000;

export type ReservationResponse = {
  ok: boolean;
  reservation: Reservation;
};

type StatusWrite = Parameters<typeof setStatus>[0];

// Inside an attempt only its owner may write; outside one, writes never clobber it.
async function write(attempt: AttemptRef | undefined, patch: StatusWrite): Promise<Reservation> {
  return attempt ? finishAttempt(attempt, patch) : setStatus(patch);
}

export async function persistResult(opts: {
  userId: string;
  query: string;
  platform: PassportPlatform;
  result: ReservationResult;
  attempt?: AttemptRef;
}): Promise<ReservationResponse> {
  const { userId, query, platform, result } = opts;
  if (result.ok) {
    const reservation = await write(opts.attempt, {
      userId,
      query,
      platform,
      status: "reserved",
      externalId: result.externalId,
      url: result.url,
      failureCode: null,
      failureDetail: null,
    });
    return { ok: true, reservation };
  }
  const reservation = await write(opts.attempt, {
    userId,
    query,
    platform,
    status: "failed",
    fallbackUrl: result.fallbackUrl ?? null,
    failureCode: result.failureCode,
    failureDetail: result.detail,
  });
  return { ok: false, reservation };
}

export async function persistError(opts: {
  userId: string;
  query: string;
  platform: PassportPlatform;
  failureCode: ReservationFailureCode;
  detail: string;
  fallbackUrl?: string | null;
  attempt?: AttemptRef;
}): Promise<ReservationResponse> {
  const reservation = await write(opts.attempt, {
    userId: opts.userId,
    query: opts.query,
    platform: opts.platform,
    status: "failed",
    failureCode: opts.failureCode,
    failureDetail: opts.detail,
    fallbackUrl: opts.fallbackUrl ?? null,
  });
  return { ok: false, reservation };
}

export function requireQuery(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 80) return null;
  return trimmed;
}

export function readPlanGate(plan: "free" | "pro"): {
  allowed: boolean;
  reason: string | null;
} {
  if (plan === "pro") return { allowed: true, reason: null };
  return {
    allowed: false,
    reason: "passport reservations require a Pro plan",
  };
}

// Provider mutations remain off until auth, billing and provider setup are verified.
export function passportOrigin(): string | null {
  const configured = process.env.BETTER_AUTH_URL;
  if (process.env.PASSPORT_ACTIONS_ENABLED !== "1" || !configured) return null;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "127.0.0.1")) return null;
    return url.origin;
  } catch { return null; }
}

export function attemptConflictResponse(err: unknown): Response | null {
  if (!(err instanceof PassportAttemptError)) return null;
  return NextResponse.json({ error: err.conflict }, { status: 409 });
}
