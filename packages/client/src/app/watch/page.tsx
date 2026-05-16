"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import type { CheckSummary, ProviderCategory, Verdict } from "@starter/shared";
import { ThemeToggle } from "@/components/ThemeToggle";

type WatchItem = {
  id: string;
  query: string;
  categories: ProviderCategory[] | null;
  providers: string[] | null;
  createdAt: number;
  lastRunAt: number | null;
  verdict: Verdict | null;
  rollup: CheckSummary["rollup"] | null;
  summary: CheckSummary | null;
};

type WatchResponse = {
  watches: WatchItem[];
};

const VERDICT_CLS: Record<Verdict, string> = {
  likely_available:
    "bg-emerald-500/15 text-emerald-700 ring-emerald-500/40 dark:text-emerald-300",
  likely_taken: "bg-rose-500/15 text-rose-700 ring-rose-500/40 dark:text-rose-300",
  mixed: "bg-amber-500/15 text-amber-700 ring-amber-500/40 dark:text-amber-300",
};

const VERDICT_LABEL: Record<Verdict, string> = {
  likely_available: "LIKELY AVAILABLE",
  likely_taken: "LIKELY TAKEN",
  mixed: "MIXED",
};

function formatAge(ms: number | null): string {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function WatchListPage(): React.ReactElement {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [unauthed, setUnauthed] = useState<boolean>(false);

  async function load(): Promise<void> {
    setError(null);
    try {
      const res = await fetch("/api/watch");
      if (res.status === 401) {
        setUnauthed(true);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as WatchResponse;
      setItems(data.watches);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(id: string): Promise<void> {
    const res = await fetch(`/api/watch?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      setError("could not unpin");
      return;
    }
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-6">
        <Link href="/" className="text-2xl font-bold tracking-tight text-foreground">
          name-check
        </Link>
        <ThemeToggle />
      </div>
      <div className="mx-auto max-w-5xl px-4 py-10 text-foreground">
        <h1 className="mb-6 text-xl font-semibold">Watch list</h1>

        {loading && (
          <div className="text-sm text-muted-foreground">Loading…</div>
        )}

        {unauthed && (
          <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
            Sign in to pin queries and get daily availability alerts.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-md border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {!loading && !unauthed && items.length === 0 && (
          <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
            No pinned watches yet. Visit{" "}
            <Link href="/" className="underline">a check page</Link> and click ☆ watch
            to pin one.
          </div>
        )}

        {items.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm" data-testid="watch-table">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Query</th>
                  <th className="px-4 py-2">Verdict</th>
                  <th className="px-4 py-2">Last run</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((w) => {
                  const isOpen = expanded === w.id;
                  return (
                    <Fragment key={w.id}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : w.id)}
                        className="cursor-pointer border-t border-border hover:bg-muted/30"
                      >
                        <td className="px-4 py-3 font-mono">
                          <Link
                            href={`/check/${encodeURIComponent(w.query)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:underline"
                          >
                            {w.query}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          {w.verdict ? (
                            <span
                              className={`rounded px-2 py-1 text-xs font-bold ring-1 ring-inset ${VERDICT_CLS[w.verdict]}`}
                            >
                              {VERDICT_LABEL[w.verdict]}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {formatAge(w.lastRunAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void remove(w.id);
                            }}
                            className="rounded-md border border-border px-2 py-1 text-xs hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-300"
                          >
                            unpin
                          </button>
                        </td>
                      </tr>
                      {isOpen && w.summary && (
                        <tr className="border-t border-border bg-muted/20">
                          <td colSpan={4} className="px-4 py-3">
                            <div className="grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground md:grid-cols-6">
                              <div>avail: {w.rollup?.available ?? 0}</div>
                              <div>taken: {w.rollup?.taken ?? 0}</div>
                              <div>partial: {w.rollup?.partial ?? 0}</div>
                              <div>verify: {w.rollup?.manual_verify ?? 0}</div>
                              <div>unknown: {w.rollup?.unknown ?? 0}</div>
                              <div>error: {w.rollup?.error ?? 0}</div>
                            </div>
                            <ul className="mt-3 space-y-1 text-xs">
                              {w.summary.results.slice(0, 12).map((r) => (
                                <li key={r.providerId} className="flex items-center justify-between gap-3">
                                  <span className="font-mono text-foreground">{r.providerName}</span>
                                  <span className="font-mono uppercase text-muted-foreground">
                                    {r.status}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
