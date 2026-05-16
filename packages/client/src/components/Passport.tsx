"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PassportPlatform,
  Reservation,
  ReservationStatus,
} from "@starter/shared";

const PLATFORMS: PassportPlatform[] = ["github", "npm", "bluesky"];

const PLATFORM_META: Record<
  PassportPlatform,
  { title: string; subtitle: string; emojiless: string }
> = {
  github: {
    title: "GitHub organization",
    subtitle:
      "Create a GitHub organization with this name. Falls back to a soft link if the public API is unavailable.",
    emojiless: "github.com/<query>",
  },
  npm: {
    title: "npm scope",
    subtitle:
      "Reserve the npm scope by publishing a tiny placeholder package, then unpublishing the version (scope sticks).",
    emojiless: "@<query>",
  },
  bluesky: {
    title: "Bluesky handle",
    subtitle:
      "Create a Bluesky account at <query>.bsky.social. Saves the generated app password to your reservation record.",
    emojiless: "<query>.bsky.social",
  },
};

const STATUS_LABEL: Record<ReservationStatus, string> = {
  idle: "IDLE",
  connecting: "CONNECTING",
  reserving: "RESERVING",
  reserved: "RESERVED",
  failed: "FAILED",
};

const STATUS_CLS: Record<ReservationStatus, string> = {
  idle: "bg-zinc-500/10 text-zinc-600 ring-zinc-500/30 dark:text-zinc-400",
  connecting:
    "bg-sky-500/10 text-sky-700 ring-sky-500/30 dark:text-sky-300",
  reserving:
    "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  reserved:
    "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
  failed:
    "bg-rose-500/10 text-rose-700 ring-rose-500/30 dark:text-rose-300",
};

type FailureChipLabel = {
  name_taken: string;
  insufficient_perms: string;
  rate_limited: string;
  invalid_credentials: string;
  missing_credentials: string;
  soft_fallback: string;
  network_error: string;
  unknown: string;
};
const FAILURE_LABEL: FailureChipLabel = {
  name_taken: "Name already taken",
  insufficient_perms: "Insufficient permissions",
  rate_limited: "Rate limited — try again",
  invalid_credentials: "Invalid credentials",
  missing_credentials: "Credentials missing",
  soft_fallback: "Soft fallback — manual step",
  network_error: "Network error",
  unknown: "Unknown error",
};

type PassportProps = { query: string };

type StatusResponse = {
  userId: string;
  plan: "free" | "pro";
  reservations: Reservation[];
};

type StartGithubResponse = {
  mode: "oauth" | "soft_fallback";
  authorizeUrl: string | null;
  fallbackUrl: string;
  reservation?: Reservation;
};

type NpmResponse = {
  ok: boolean;
  reservation: Reservation;
};

type BlueskyResponse = {
  ok: boolean;
  reservation: Reservation;
  handle: string;
  password: string | null;
};

function emptyReservation(
  query: string,
  platform: PassportPlatform,
): Reservation {
  return {
    userId: "",
    query,
    platform,
    status: "idle",
    externalId: null,
    url: null,
    fallbackUrl: null,
    failureCode: null,
    failureDetail: null,
    createdAt: "",
    updatedAt: "",
  };
}

export function Passport({ query }: PassportProps): React.ReactElement {
  const [reservations, setReservations] = useState<
    Record<PassportPlatform, Reservation>
  >({
    github: emptyReservation(query, "github"),
    npm: emptyReservation(query, "npm"),
    bluesky: emptyReservation(query, "bluesky"),
  });
  const [busy, setBusy] = useState<Record<PassportPlatform, boolean>>({
    github: false,
    npm: false,
    bluesky: false,
  });
  const [npmToken, setNpmToken] = useState<string>("");
  const [bskyEmail, setBskyEmail] = useState<string>("");
  const [bskyInvite, setBskyInvite] = useState<string>("");
  const [bskyPassword, setBskyPassword] = useState<
    Record<string, string | null>
  >({});
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(
      `/api/passport/status?query=${encodeURIComponent(query)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return;
    const body = (await res.json()) as StatusResponse;
    setPlan(body.plan);
    setReservations((prev) => {
      const next = { ...prev };
      for (const r of body.reservations) {
        next[r.platform] = r;
      }
      return next;
    });
  }, [query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#github=")) return;
    const next = hash === "#github=reserved" || hash === "#github=failed";
    if (next) {
      void refresh();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
  }, [refresh]);

  const reserveGithub = useCallback(async () => {
    setBusy((b) => ({ ...b, github: true }));
    setError(null);
    try {
      const res = await fetch("/api/passport/github", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query,
          redirectOrigin: window.location.origin,
        }),
      });
      const body = (await res.json()) as StartGithubResponse & {
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        setError(body.detail ?? body.error ?? "github reserve failed");
        return;
      }
      if (body.mode === "oauth" && body.authorizeUrl) {
        window.location.href = body.authorizeUrl;
        return;
      }
      window.open(body.fallbackUrl, "_blank", "noopener,noreferrer");
      await refresh();
    } finally {
      setBusy((b) => ({ ...b, github: false }));
    }
  }, [query, refresh]);

  const reserveNpm = useCallback(async () => {
    setBusy((b) => ({ ...b, npm: true }));
    setError(null);
    try {
      const res = await fetch("/api/passport/npm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query,
          token: npmToken || undefined,
        }),
      });
      const body = (await res.json()) as NpmResponse & {
        error?: string;
        detail?: string;
      };
      if (!res.ok && body.error) {
        setError(body.detail ?? body.error);
      }
      if (body.reservation) {
        setReservations((p) => ({ ...p, npm: body.reservation }));
      }
    } finally {
      setBusy((b) => ({ ...b, npm: false }));
    }
  }, [query, npmToken]);

  const reserveBluesky = useCallback(async () => {
    if (!bskyEmail.trim()) {
      setError("provide an email for the bluesky account");
      return;
    }
    setBusy((b) => ({ ...b, bluesky: true }));
    setError(null);
    try {
      const res = await fetch("/api/passport/bluesky", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query,
          email: bskyEmail.trim(),
          inviteCode: bskyInvite.trim() || undefined,
        }),
      });
      const body = (await res.json()) as BlueskyResponse & {
        error?: string;
        detail?: string;
      };
      if (!res.ok && body.error) {
        setError(body.detail ?? body.error);
      }
      if (body.reservation) {
        setReservations((p) => ({ ...p, bluesky: body.reservation }));
      }
      if (body.password) {
        setBskyPassword((p) => ({ ...p, [body.handle]: body.password }));
      }
    } finally {
      setBusy((b) => ({ ...b, bluesky: false }));
    }
  }, [query, bskyEmail, bskyInvite]);

  const reservedCount = useMemo(
    () =>
      PLATFORMS.filter((p) => reservations[p].status === "reserved").length,
    [reservations],
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Brand passport for{" "}
            <span className="font-mono">{query}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Claim this name across {PLATFORMS.length} platforms in one flow.
            Reservations are recorded server-side and resume if you reload.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded px-2 py-1 text-xs font-mono font-medium ring-1 ring-inset ${
              plan === "pro"
                ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300"
                : "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-300"
            }`}
          >
            plan: {plan.toUpperCase()}
          </span>
          <span className="text-xs text-muted-foreground">
            {reservedCount}/{PLATFORMS.length} reserved
          </span>
        </div>
      </header>

      {plan === "free" && (
        <div className="mb-6 rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-900 dark:text-amber-200">
          <strong>Pro feature.</strong> The brand passport is gated behind the
          Pro plan. Set{" "}
          <code className="rounded bg-amber-500/20 px-1 font-mono text-xs">
            PASSPORT_BYPASS_PLAN=1
          </code>{" "}
          in the server env to demo it locally, or wait for the better-auth
          chip to wire real billing.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {PLATFORMS.map((platform) => {
          const r = reservations[platform];
          const meta = PLATFORM_META[platform];
          const cardBusy = busy[platform];
          return (
            <section
              key={platform}
              data-testid={`passport-card-${platform}`}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-foreground">
                    {meta.title}
                  </h2>
                  <p className="font-mono text-xs text-muted-foreground">
                    {meta.emojiless.replace("<query>", query)}
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 text-[10px] font-mono font-medium ring-1 ring-inset ${STATUS_CLS[r.status]}`}
                  data-testid={`passport-status-${platform}`}
                >
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{meta.subtitle}</p>

              {platform === "npm" && (
                <input
                  type="password"
                  placeholder="npm token (optional, uses server NPM_TOKEN otherwise)"
                  value={npmToken}
                  onChange={(e) => setNpmToken(e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs font-mono"
                />
              )}

              {platform === "bluesky" && (
                <div className="flex flex-col gap-2">
                  <input
                    type="email"
                    placeholder="email for the bluesky account"
                    value={bskyEmail}
                    onChange={(e) => setBskyEmail(e.target.value)}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs font-mono"
                    data-testid="bsky-email"
                  />
                  <input
                    type="text"
                    placeholder="invite code (only if instance requires)"
                    value={bskyInvite}
                    onChange={(e) => setBskyInvite(e.target.value)}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs font-mono"
                  />
                </div>
              )}

              {r.status === "failed" && r.failureCode && (
                <div className="rounded border border-rose-500/30 bg-rose-500/5 p-2 text-xs">
                  <div className="font-medium text-rose-700 dark:text-rose-300">
                    {FAILURE_LABEL[r.failureCode]}
                  </div>
                  {r.failureDetail && (
                    <div className="mt-1 text-rose-700/80 dark:text-rose-300/80">
                      {r.failureDetail}
                    </div>
                  )}
                  {r.fallbackUrl && (
                    <a
                      href={r.fallbackUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block underline-offset-2 hover:underline"
                    >
                      open fallback ↗
                    </a>
                  )}
                </div>
              )}

              {r.status === "reserved" && r.url && (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
                  data-testid={`passport-link-${platform}`}
                >
                  view on {platform} ↗
                </a>
              )}

              {platform === "bluesky" &&
                r.status === "reserved" &&
                bskyPassword[`${query}.bsky.social`] && (
                  <div className="rounded border border-border bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
                    handle password:{" "}
                    <span className="select-all text-foreground">
                      {bskyPassword[`${query}.bsky.social`]}
                    </span>
                    <div className="text-[10px] text-muted-foreground/80">
                      copy now — shown once.
                    </div>
                  </div>
                )}

              <button
                type="button"
                onClick={() => {
                  if (platform === "github") void reserveGithub();
                  else if (platform === "npm") void reserveNpm();
                  else void reserveBluesky();
                }}
                disabled={cardBusy || r.status === "reserved"}
                data-testid={`passport-reserve-${platform}`}
                className="mt-auto rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {r.status === "reserved"
                  ? "Reserved"
                  : cardBusy
                    ? "Working…"
                    : "Reserve"}
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}
