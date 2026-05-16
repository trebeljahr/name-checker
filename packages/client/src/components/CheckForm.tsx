"use client";

import { useState } from "react";
import type {
  CheckSummary,
  ProviderCategory,
  ProviderResult,
  Verdict,
} from "@starter/shared";
import { CategoryGroup } from "./CheckResults";

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

const VERDICT_STYLE: Record<Verdict, { label: string; cls: string }> = {
  likely_available: {
    label: "LIKELY AVAILABLE",
    cls: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/40",
  },
  likely_taken: {
    label: "LIKELY TAKEN",
    cls: "bg-rose-500/20 text-rose-300 ring-rose-500/40",
  },
  mixed: {
    label: "MIXED — VERIFY MANUALLY",
    cls: "bg-amber-500/20 text-amber-300 ring-amber-500/40",
  },
};

export function CheckForm(): React.ReactElement {
  const [query, setQuery] = useState<string>("");
  const [categories, setCategories] = useState<ProviderCategory[]>(ALL_CATEGORIES);
  const [running, setRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<ProviderResult[]>([]);
  const [summary, setSummary] = useState<CheckSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleCategory(c: ProviderCategory): void {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!query.trim() || running) return;
    setRunning(true);
    setResults([]);
    setSummary(null);
    setError(null);
    setProgress(null);

    try {
      const res = await fetch("/api/check?stream=1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: query.trim(), categories }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(`server responded ${res.status}: ${text.slice(0, 200)}`);
      }
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

  const grouped = groupByCategory(results);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 text-zinc-100">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">name-check</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Check name availability across trademarks, domains, social handles, app stores, package registries, and code hosts.
        </p>
      </header>

      <form onSubmit={submit} className="mb-6 flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            data-testid="check-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="kairosprotocol"
            autoFocus
            disabled={running}
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-base font-mono placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={running || !query.trim()}
            data-testid="check-submit"
            className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "Checking…" : "Check"}
          </button>
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
                    ? "border-zinc-300 bg-zinc-100 text-zinc-900"
                    : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            );
          })}
        </div>
      </form>

      {error && (
        <div className="mb-4 rounded-md border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {(running || results.length > 0) && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="text-sm text-zinc-300">
            {running ? (
              <span>
                Checking <span className="font-mono">{query}</span>… {results.length} done
              </span>
            ) : summary ? (
              <span>
                Done. <span className="font-mono">{summary.totalMs}ms</span> · {results.length} providers
              </span>
            ) : null}
          </div>
          {summary && (
            <VerdictBadge
              verdict={summary.verdict}
              rollup={summary.rollup}
              data-testid="verdict"
            />
          )}
        </div>
      )}

      {progress && running && (
        <div className="mb-4 h-1 w-full overflow-hidden rounded bg-zinc-800">
          <div className="h-full animate-pulse rounded bg-zinc-500" style={{ width: "60%" }} />
        </div>
      )}

      <div className="space-y-4">
        {ALL_CATEGORIES.filter((c) => grouped.get(c)?.length).map((c) => (
          <CategoryGroup key={c} category={c} results={grouped.get(c)!} />
        ))}
      </div>
    </div>
  );
}

function VerdictBadge({
  verdict,
  rollup,
}: {
  verdict: Verdict;
  rollup: CheckSummary["rollup"];
}): React.ReactElement {
  const s = VERDICT_STYLE[verdict];
  return (
    <div className="flex items-center gap-3">
      <div className="font-mono text-xs text-zinc-500">
        avail:{rollup.available} · taken:{rollup.taken} · part:{rollup.partial} · check:{rollup.manual_verify} · err:{rollup.error}
      </div>
      <span
        data-testid="verdict-badge"
        className={`rounded px-2 py-1 text-xs font-bold ring-1 ring-inset ${s.cls}`}
      >
        {s.label}
      </span>
    </div>
  );
}

function groupByCategory(rs: ProviderResult[]): Map<ProviderCategory, ProviderResult[]> {
  const m = new Map<ProviderCategory, ProviderResult[]>();
  for (const r of rs) {
    const arr = m.get(r.category) ?? [];
    arr.push(r);
    m.set(r.category, arr);
  }
  return m;
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
