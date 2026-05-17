"use client";

import { useEffect, useState } from "react";
import type {
  CheckSummary,
  ProviderCategory,
  ProviderResult,
} from "@starter/shared";
import {
  CompareMatrix,
  formatCompareCsv,
  formatCompareMarkdown,
  makeKey,
  type LiveMatrix,
} from "./CompareMatrix";
import {
  CATEGORY_LABEL_SHORT as CATEGORY_LABEL,
  CATEGORY_ORDER,
} from "@/lib/ui-constants";

const ALL_CATEGORIES: readonly ProviderCategory[] = CATEGORY_ORDER;

const MAX_QUERIES = 10;

type ProviderDescriptor = {
  id: string;
  name: string;
  category: ProviderCategory;
};

function parseInput(raw: string): string[] {
  return raw
    .split(/[,\n]+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, MAX_QUERIES);
}

export function CompareForm({
  initialQueries = [],
}: {
  initialQueries?: string[];
} = {}): React.ReactElement {
  const initialText = initialQueries.join(", ");
  const [input, setInput] = useState<string>(initialText);
  const [categories, setCategories] =
    useState<ProviderCategory[]>([...ALL_CATEGORIES]);
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<LiveMatrix>({
    queries: [],
    providers: [],
    cells: new Map<string, ProviderResult>(),
    summaries: [],
  });

  function toggleCategory(c: ProviderCategory): void {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }

  async function run(queries: string[]): Promise<void> {
    if (queries.length === 0 || running) return;
    setRunning(true);
    setError(null);
    const initial: LiveMatrix = {
      queries,
      providers: [],
      cells: new Map(),
      summaries: queries.map(() => null),
    };
    setMatrix(initial);

    try {
      const res = await fetch("/api/check/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queries, categories }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(
          `server responded ${res.status}: ${text.slice(0, 200)}`,
        );
      }
      const params = new URLSearchParams();
      params.set("names", queries.join(","));
      window.history.replaceState(null, "", `/compare?${params.toString()}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const cells = new Map<string, ProviderResult>();
      const summaries: Array<CheckSummary | null> = queries.map(() => null);
      let providers: ProviderDescriptor[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() ?? "";
        for (const block of blocks) {
          const ev = parseSseBlock(block);
          if (!ev) continue;
          if (ev.event === "start") {
            const data = ev.data as {
              queries: string[];
              providers: ProviderDescriptor[];
            };
            providers = data.providers;
            setMatrix((m) => ({
              ...m,
              queries: data.queries,
              providers: data.providers,
            }));
          } else if (ev.event === "result") {
            const data = ev.data as { query: string; result: ProviderResult };
            cells.set(makeKey(data.query, data.result.providerId), data.result);
            setMatrix((m) => ({
              ...m,
              cells: new Map(cells),
              providers,
            }));
          } else if (ev.event === "query_done") {
            const data = ev.data as { index: number; summary: CheckSummary };
            summaries[data.index] = data.summary;
            setMatrix((m) => ({ ...m, summaries: summaries.slice() }));
          } else if (ev.event === "done") {
            const data = ev.data as { results: CheckSummary[] };
            data.results.forEach((s, i) => {
              summaries[i] = s;
            });
            setMatrix((m) => ({ ...m, summaries: summaries.slice() }));
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

  useEffect(() => {
    if (initialQueries.length > 0) void run(initialQueries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const queries = parseInput(input);
    if (queries.length === 0) {
      setError("enter at least one name");
      return;
    }
    if (queries.length === 1) {
      setError("compare needs at least 2 names");
      return;
    }
    await run(queries);
  }

  function copyMarkdown(): void {
    const md = formatCompareMarkdown(matrix);
    void navigator.clipboard.writeText(md);
  }

  function copyCsv(): void {
    const csv = formatCompareCsv(matrix);
    void navigator.clipboard.writeText(csv);
  }

  function downloadCsv(): void {
    const csv = formatCompareCsv(matrix);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compare-${matrix.queries.join("-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const parsedPreview = parseInput(input);
  const hasResults = matrix.providers.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 text-foreground">
      <form onSubmit={submit} className="mb-6 flex flex-col gap-3">
        <label
          htmlFor="compare-names"
          className="text-sm font-medium text-foreground"
        >
          Names to compare ({parsedPreview.length}/{MAX_QUERIES})
        </label>
        <textarea
          id="compare-names"
          data-testid="compare-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`kairos, outpostkairos, projectx\n(or one per line)`}
          rows={3}
          disabled={running}
          className="w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-sm placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none disabled:opacity-50"
        />
        <div className="flex flex-wrap items-center gap-2">
          {ALL_CATEGORIES.map((c) => {
            const active = categories.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCategory(c)}
                disabled={running}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/50"
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            );
          })}
          <button
            type="submit"
            data-testid="compare-submit"
            disabled={running || parsedPreview.length < 2}
            className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "Comparing…" : "Compare"}
          </button>
        </div>
      </form>

      {error && (
        <div
          data-testid="compare-error"
          className="mb-4 rounded-md border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {hasResults && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyMarkdown}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            Copy Markdown
          </button>
          <button
            type="button"
            onClick={copyCsv}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            Copy CSV
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            Download CSV
          </button>
          <span className="ml-auto text-xs text-muted-foreground">
            Hover a cell for detail · click column header to sort
          </span>
        </div>
      )}

      {hasResults ? (
        <CompareMatrix matrix={matrix} running={running} />
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
          {running
            ? "Loading providers…"
            : "Enter 2–10 names (comma- or newline-separated) and hit Compare."}
        </div>
      )}
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
