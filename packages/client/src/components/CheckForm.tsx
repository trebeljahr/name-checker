"use client";

import { useEffect, useRef, useState } from "react";
import type {
  CheckSummary,
  ProviderCategory,
  ProviderResult,
} from "@starter/shared";
import { ResultsView } from "./CheckResults";
import { getRecent, pushRecent } from "@/lib/history";

const ALL_CATEGORIES: ProviderCategory[] = [
  "trademark",
  "domain",
  "social",
  "appstore",
  "package",
  "code",
];

const CATEGORY_LABEL: Record<ProviderCategory, string> = {
  trademark: "Trademarks",
  domain: "Domains",
  social: "Social",
  appstore: "App stores",
  package: "Packages",
  code: "Code",
};

export function CheckForm({
  initialQuery = "",
  initialResults,
  initialSummary,
}: {
  initialQuery?: string;
  initialResults?: ProviderResult[];
  initialSummary?: CheckSummary | null;
} = {}): React.ReactElement {
  const [query, setQuery] = useState<string>(initialQuery);
  const [categories, setCategories] =
    useState<ProviderCategory[]>(ALL_CATEGORIES);
  const [running, setRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [results, setResults] = useState<ProviderResult[]>(initialResults ?? []);
  const [summary, setSummary] = useState<CheckSummary | null>(
    initialSummary ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [recentOpen, setRecentOpen] = useState<boolean>(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRecent(getRecent());
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent): void {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setRecentOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  function toggleCategory(c: ProviderCategory): void {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }

  async function run(q: string): Promise<void> {
    const trimmed = q.trim();
    if (!trimmed || running) return;
    setRunning(true);
    setResults([]);
    setSummary(null);
    setError(null);
    setProgress(null);
    setRecentOpen(false);

    try {
      const res = await fetch("/api/check?stream=1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: trimmed, categories }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(`server responded ${res.status}: ${text.slice(0, 200)}`);
      }
      window.history.replaceState(
        null,
        "",
        `/check/${encodeURIComponent(trimmed)}${window.location.hash}`,
      );
      pushRecent(trimmed);
      setRecent(getRecent());

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const local: ProviderResult[] = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() ?? "";
        for (const block of blocks) {
          const ev = parseSseBlock(block);
          if (!ev) continue;
          if (ev.event === "result") {
            local.push(ev.data as ProviderResult);
            setResults([...local]);
            setProgress({ done: local.length, total: NaN });
          } else if (ev.event === "done") {
            setSummary(ev.data as CheckSummary);
          } else if (ev.event === "error") {
            setError((ev.data as { message: string }).message);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    await run(query);
  }

  function pickRecent(q: string): void {
    setQuery(q);
    setRecentOpen(false);
    void run(q);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 text-foreground">
      <form onSubmit={submit} className="mb-6 flex flex-col gap-3">
        <div className="relative flex gap-2" ref={wrapRef}>
          <input
            data-testid="check-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setRecentOpen(true)}
            placeholder="kairosprotocol"
            autoFocus
            disabled={running}
            className="flex-1 rounded-md border border-input bg-card px-3 py-2 text-base font-mono placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={running || !query.trim()}
            data-testid="check-submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "Checking…" : "Check"}
          </button>
          {recentOpen && recent.length > 0 && (
            <ul
              data-testid="recent-list"
              className="absolute left-0 top-full z-10 mt-1 w-full max-w-lg overflow-hidden rounded-md border border-border bg-card shadow-lg"
            >
              <li className="px-3 py-1 text-xs uppercase tracking-wider text-muted-foreground">
                Recent
              </li>
              {recent.map((r) => (
                <li key={r}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickRecent(r)}
                    className="block w-full px-3 py-1.5 text-left font-mono text-sm text-foreground hover:bg-accent"
                  >
                    {r}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {ALL_CATEGORIES.map((c) => {
            const active = categories.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCategory(c)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/50"
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            );
          })}
        </div>
      </form>

      {error && (
        <div className="mb-4 rounded-md border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {progress && running && (
        <div className="mb-4 h-1 w-full overflow-hidden rounded bg-muted">
          <div
            className="h-full animate-pulse rounded bg-muted-foreground/60"
            style={{ width: "60%" }}
          />
        </div>
      )}

      <ResultsView
        results={results}
        summary={summary}
        running={running}
        query={query}
      />
    </div>
  );
}

function parseSseBlock(block: string): { event: string; data: unknown } | null {
  const lines = block.split("\n");
  let event = "message";
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return null;
  }
}
