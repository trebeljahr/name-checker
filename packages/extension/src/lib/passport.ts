export type PlatformId =
  | "x"
  | "tiktok"
  | "instagram"
  | "reddit"
  | "twitch"
  | "threads"
  | "linkedin";

export type PlatformStatus = "not_started" | "tab_open" | "done";

export interface Passport {
  query: string;
  email?: string;
  status?: Partial<Record<PlatformId, PlatformStatus>>;
  updatedAt?: number;
}

export interface PlatformDef {
  id: PlatformId;
  label: string;
  signupUrl: string;
  confirmHint: string;
}

export const PLATFORMS: readonly PlatformDef[] = [
  {
    id: "x",
    label: "X (Twitter)",
    signupUrl: "https://x.com/i/flow/signup",
    confirmHint: "lands on https://x.com/home",
  },
  {
    id: "tiktok",
    label: "TikTok",
    signupUrl: "https://www.tiktok.com/signup/phone-or-email/email",
    confirmHint: "username confirmed in profile",
  },
  {
    id: "instagram",
    label: "Instagram",
    signupUrl: "https://www.instagram.com/accounts/emailsignup/",
    confirmHint: "lands on feed",
  },
  {
    id: "reddit",
    label: "Reddit",
    signupUrl: "https://www.reddit.com/register",
    confirmHint: "lands on home with new account chip",
  },
  {
    id: "twitch",
    label: "Twitch",
    signupUrl: "https://www.twitch.tv/signup",
    confirmHint: "lands on directory with logged-in nav",
  },
  {
    id: "threads",
    label: "Threads",
    signupUrl: "https://www.threads.net/login",
    confirmHint: "linked to IG handle — confirm by visiting profile URL",
  },
  {
    id: "linkedin",
    label: "LinkedIn (company page)",
    signupUrl: "https://www.linkedin.com/setup/create-company-page/",
    confirmHint: "landing page for the new company",
  },
] as const;

const STORAGE_KEY = "passport";
const DEFAULT_ORIGIN = "http://localhost:3000";

export const getPassportOrigin = (): string => {
  const fromEnv = (globalThis as { PASSPORT_ORIGIN?: string }).PASSPORT_ORIGIN;
  return fromEnv ?? DEFAULT_ORIGIN;
};

export const readPassport = async (): Promise<Passport | null> => {
  const got = await chrome.storage.local.get(STORAGE_KEY);
  return (got[STORAGE_KEY] as Passport | undefined) ?? null;
};

export const writePassport = async (p: Passport): Promise<void> => {
  await chrome.storage.local.set({ [STORAGE_KEY]: { ...p, updatedAt: Date.now() } });
};

export const updateStatus = async (
  id: PlatformId,
  status: PlatformStatus,
): Promise<Passport | null> => {
  const current = await readPassport();
  if (!current) return null;
  const next: Passport = {
    ...current,
    status: { ...(current.status ?? {}), [id]: status },
    updatedAt: Date.now(),
  };
  await writePassport(next);
  return next;
};

export const reportConfirm = async (
  query: string,
  platform: PlatformId,
): Promise<void> => {
  const origin = getPassportOrigin();
  try {
    await fetch(`${origin}/api/passport/manual-confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, platform }),
      credentials: "omit",
      keepalive: true,
    });
  } catch {
    // backend may not yet implement this endpoint; ignore
  }
};

export type BgMessage =
  | { type: "open_signup"; platform: PlatformId }
  | { type: "open_all" }
  | { type: "platform_done"; platform: PlatformId }
  | { type: "platform_tab_open"; platform: PlatformId }
  | { type: "get_passport" }
  | { type: "set_passport"; passport: Passport };

export type BgResponse =
  | { ok: true; passport: Passport | null }
  | { ok: true }
  | { ok: false; error: string };

export const STORAGE_KEY_EXPORT = STORAGE_KEY;
