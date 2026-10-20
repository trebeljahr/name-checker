"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  BULK_NAMES_PER_RUN,
  BULK_RUNS_PER_DAY,
  PASSPORT_STARTS_PER_DAY,
} from "@starter/shared/limits";

type Me =
  | { authenticated: false }
  | { authenticated: true; user: { id: string; email: string } };

export function AccountView(): React.ReactElement | null {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return (await res.json()) as Me;
      })
      .then((data) => {
        if (cancelled) return;
        if (!data.authenticated) router.replace("/sign-in");
        else setMe(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <main className="min-h-screen bg-background">
        <p className="mx-auto max-w-3xl px-6 py-10 text-sm text-muted-foreground">
          Could not load your account ({error}). Reload to try again.
        </p>
      </main>
    );
  }
  if (!me?.authenticated) return null;

  const session = me;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 pt-6">
        <Link
          href="/"
          className="font-mono text-sm font-semibold text-foreground"
        >
          name-check
        </Link>
        <ThemeToggle />
      </div>

      <section className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Account
        </h1>

        <div className="mt-8 rounded-xl border border-border bg-card/60 p-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Signed in as
          </div>
          <div className="mt-1 text-lg font-medium text-foreground">
            {session.user.email}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card/60 p-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Daily limits
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            name-check is free. A bulk run checks up to {BULK_NAMES_PER_RUN}{" "}
            names, and you get {BULK_RUNS_PER_DAY} runs a day. You can start{" "}
            {PASSPORT_STARTS_PER_DAY} Passport reservations a day.
          </p>
        </div>
      </section>
    </main>
  );
}
