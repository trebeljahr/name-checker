"use client";

import { useState } from "react";

export function ManageBillingButton(): React.ReactElement {
  const [loading, setLoading] = useState(false);

  async function onClick(): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error(data.error ?? "Failed to open billing portal");
    } catch (err) {
      setLoading(false);
      alert(err instanceof Error ? err.message : "Error opening portal");
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
    >
      {loading ? "Opening…" : "Manage billing"}
    </button>
  );
}
