import type {
  PassportPlatform,
  Reservation,
  ReservationFailureCode,
  ReservationResult,
} from "@starter/shared";
import { setStatus } from "./passport-store";

export type ReservationResponse = {
  ok: boolean;
  reservation: Reservation;
};

export async function persistResult(opts: {
  userId: string;
  query: string;
  platform: PassportPlatform;
  result: ReservationResult;
}): Promise<ReservationResponse> {
  const { userId, query, platform, result } = opts;
  if (result.ok) {
    const reservation = await setStatus({
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
  const reservation = await setStatus({
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
}): Promise<ReservationResponse> {
  const reservation = await setStatus({
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
  if (process.env.PASSPORT_BYPASS_PLAN === "1") {
    return { allowed: true, reason: null };
  }
  if (plan === "pro") return { allowed: true, reason: null };
  return {
    allowed: false,
    reason: "passport reservations require a Pro plan",
  };
}
