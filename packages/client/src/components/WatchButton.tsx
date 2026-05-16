"use client";

import { useEffect, useState } from "react";
import type { ProviderCategory } from "@starter/shared";

type WatchListItem = {
  id: string;
  query: string;
};

type WatchListResponse = {
  watches: WatchListItem[];
};

export function WatchButton({
  query,
  categories,
  providers,
}: {
  query: string;
  categories?: ProviderCategory[];
  providers?: string[];
}): React.ReactElement | null {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const res = await fetch("/api/watch");
        if (res.status === 401) {
          if (!cancelled) setLoading(false);
          return;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as WatchListResponse;
        if (cancelled) return;
        const match = data.watches.find(
          (w) => w.query.toLowerCase() === query.toLowerCase(),
        );
        setPinnedId(match?.id ?? null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [query]);

  async function pin(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, categories, providers }),
      });
      if (res.status === 401) {
        setError("sign in to pin watches");
        return;
      }
      const data = (await res.json()) as { id: string };
      if (!res.ok) throw new Error("could not pin");
      setPinnedId(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function unpin(): Promise<void> {
    if (!pinnedId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/watch?id=${encodeURIComponent(pinnedId)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 404) throw new Error("could not unpin");
      setPinnedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;
  if (error === "sign in to pin watches") return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={pinnedId ? unpin : pin}
        disabled={busy}
        data-testid="watch-button"
        className={`rounded-md border px-3 py-1.5 text-xs font-mono transition-colors ${
          pinnedId
            ? "border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
            : "border-border bg-card text-muted-foreground hover:border-foreground/50"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {busy ? "…" : pinnedId ? "★ watching" : "☆ watch"}
      </button>
      {error && error !== "sign in to pin watches" && (
        <span className="text-xs text-rose-500">{error}</span>
      )}
    </div>
  );
}
