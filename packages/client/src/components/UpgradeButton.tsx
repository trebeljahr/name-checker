"use client";

import { useState } from "react";
import { useSession } from "@/lib/auth-client";

export function UpgradeButton({
  label = "Upgrade to Pro",
  className,
}: {
  label?: string;
  className?: string;
}): React.ReactElement {
  const { data, isPending } = useSession();
  const [loading, setLoading] = useState(false);

  const baseClass =
    className ??
    "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50";

  async function onClick(): Promise<void> {
    if (isPending) return;
    if (!data?.user) {
      window.location.href = "/sign-in?next=/pricing";
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const json = (await res.json()) as { url?: string; error?: string };
      if (json.url) {
        window.location.href = json.url;
        return;
      }
      throw new Error(json.error ?? "Failed to start checkout");
    } catch (err) {
      setLoading(false);
      alert(err instanceof Error ? err.message : "Error starting checkout");
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || isPending}
      className={baseClass}
    >
      {loading ? "Redirecting…" : label}
    </button>
  );
}
