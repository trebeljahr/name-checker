"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "@/lib/auth-client";

export default function SignInPage(): React.ReactElement {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setError(null);
    const res = await signIn.magicLink({
      email: email.trim(),
      callbackURL: "/account",
    });
    if (res.error) {
      setStatus("error");
      setError(res.error.message ?? "Failed to send link");
      return;
    }
    setStatus("sent");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card/60 p-8 shadow-sm">
        <Link
          href="/"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← back
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
          Sign in to name-check
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll email you a one-time sign-in link.
        </p>

        {status === "sent" ? (
          <div className="mt-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
            Check your inbox at <strong>{email}</strong> for a sign-in link.
            It expires in 15 minutes.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <label className="block text-sm font-medium text-foreground">
              Email
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </label>
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
