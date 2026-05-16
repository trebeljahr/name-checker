export type PassportPlatform = "github" | "npm" | "bluesky";

export type ReservationStatus =
  | "idle"
  | "connecting"
  | "reserving"
  | "reserved"
  | "failed";

export type ReservationFailureCode =
  | "name_taken"
  | "insufficient_perms"
  | "rate_limited"
  | "invalid_credentials"
  | "missing_credentials"
  | "soft_fallback"
  | "network_error"
  | "unknown";

export type Reservation = {
  userId: string;
  query: string;
  platform: PassportPlatform;
  status: ReservationStatus;
  externalId: string | null;
  url: string | null;
  fallbackUrl: string | null;
  failureCode: ReservationFailureCode | null;
  failureDetail: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReservationResult =
  | {
      ok: true;
      platform: PassportPlatform;
      externalId: string;
      url: string;
    }
  | {
      ok: false;
      platform: PassportPlatform;
      failureCode: ReservationFailureCode;
      detail: string;
      fallbackUrl?: string;
    };

export type AvailabilityResult = {
  available: boolean;
  detail: string;
};

export const PASSPORT_PLATFORMS: PassportPlatform[] = [
  "github",
  "npm",
  "bluesky",
];

export const PLATFORM_LABEL: Record<PassportPlatform, string> = {
  github: "GitHub organization",
  npm: "npm scope",
  bluesky: "Bluesky handle",
};
