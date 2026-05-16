"use client";

import { useMemo, useState } from "react";
import type {
  CheckStatus,
  CheckSummary,
  ProviderCategory,
  ProviderResult,
  Verdict,
} from "@starter/shared";

const STATUS_CELL: Record<CheckStatus, { bg: string; label: string }> = {
  available: { bg: "bg-emerald-500", label: "AVAILABLE" },
  taken: { bg: "bg-rose-500", label: "TAKEN" },
  partial: { bg: "bg-amber-500", label: "PARTIAL" },
  manual_verify: { bg: "bg-sky-500", label: "VERIFY" },
  unknown: { bg: "bg-zinc-400 dark:bg-zinc-600", label: "UNKNOWN" },
  error: { bg: "bg-fuchsia-500", label: "ERROR" },
};

const STATUS_PRIORITY: Record<CheckStatus, number> = {
  available: 0,
  manual_verify: 1,
  unknown: 2,
  error: 3,
  partial: 4,
  taken: 5,
};

const STATUS_SORT_KEY: Record<CheckStatus, number> = {
  taken: 0,
  partial: 1,
  error: 2,
  manual_verify: 3,
  unknown: 4,
  available: 5,
};

const VERDICT_STYLE: Record<
  Verdict,
  { label: string; cls: string }
> = {
  likely_available: {
    label: "AVAIL",
    cls: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/40 dark:text-emerald-300",
  },
  likely_taken: {
    label: "TAKEN",
    cls: "bg-rose-500/15 text-rose-700 ring-rose-500/40 dark:text-rose-300",
  },
  mixed: {
    label: "MIXED",
    cls: "bg-amber-500/15 text-amber-700 ring-amber-500/40 dark:text-amber-300",
  },
};

const CATEGORY_LABEL: Record<ProviderCategory, string> = {
  trademark: "Trademarks",
  domain: "Domains",
  social: "Social handles",
  appstore: "App stores",
  package: "Package registries",
  code: "Code hosts",
};

const CATEGORY_ORDER: ProviderCategory[] = [
  "trademark",
  "domain",
  "social",
  "appstore",
  "package",
  "code",
];

type ProviderDescriptor = {
  id: string;
  name: string;
  category: ProviderCategory;
};

export type LiveMatrix = {
  queries: string[];
  providers: ProviderDescriptor[];
  cells: Map<string, ProviderResult>;
  summaries: Array<CheckSummary | null>;
};

export function makeKey(query: string, providerId: string): string {
  return `${query}::${providerId}`;
}

export function CompareMatrix({
  matrix,
  running,
}: {
  matrix: LiveMatrix;
  running: boolean;
}): React.ReactElement {
  const [sortBy, setSortBy] = useState<string | null>(null);

  const providersByCategory = useMemo(() => {
    const map = new Map<ProviderCategory, ProviderDescriptor[]>();
    for (const p of matrix.providers) {
      const arr = map.get(p.category) ?? [];
      arr.push(p);
      map.set(p.category, arr);
    }
    return map;
  }, [matrix.providers]);

  const sortedCategoryOrder = useMemo(
    () => CATEGORY_ORDER.filter((c) => providersByCategory.get(c)?.length),
    [providersByCategory],
  );

  const winningIndex = useMemo(() => {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < matrix.summaries.length; i++) {
      const s = matrix.summaries[i];
      if (!s) continue;
      if (s.score > bestScore) {
        bestScore = s.score;
        best = i;
      }
    }
    return best;
  }, [matrix.summaries]);

  const sortRows = (rows: ProviderDescriptor[]): ProviderDescriptor[] => {
    if (!sortBy) return rows;
    const target = sortBy;
    return rows.slice().sort((a, b) => {
      const ra = matrix.cells.get(makeKey(target, a.id));
      const rb = matrix.cells.get(makeKey(target, b.id));
      const sa = ra ? STATUS_SORT_KEY[ra.status] : 99;
      const sb = rb ? STATUS_SORT_KEY[rb.status] : 99;
      return sa - sb;
    });
  };

  function rowBest(providerId: string): number {
    let best = -1;
    let bestPriority = Infinity;
    for (let i = 0; i < matrix.queries.length; i++) {
      const r = matrix.cells.get(makeKey(matrix.queries[i]!, providerId));
      if (!r) continue;
      const p = STATUS_PRIORITY[r.status];
      if (p < bestPriority) {
        bestPriority = p;
        best = i;
      }
    }
    return best;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Provider
            </th>
            {matrix.queries.map((q, i) => (
              <th
                key={q + i}
                className={`px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider ${
                  i === winningIndex
                    ? "bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-300"
                    : "text-foreground"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSortBy(sortBy === q ? null : q)}
                  data-testid={`compare-col-${q}`}
                  className="inline-flex flex-col items-center gap-0.5 font-mono text-xs lowercase hover:text-foreground"
                  aria-pressed={sortBy === q}
                  title={`Click to sort rows by ${q} status (worst at top)`}
                >
                  <span className="font-bold normal-case">{q}</span>
                  {sortBy === q ? (
                    <span className="text-[10px] text-muted-foreground">
                      ▲ sorted
                    </span>
                  ) : null}
                </button>
              </th>
            ))}
            <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Best
            </th>
          </tr>
          <tr className="border-b border-border bg-card">
            <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Score
            </th>
            {matrix.queries.map((q, i) => {
              const summary = matrix.summaries[i];
              return (
                <th
                  key={q + i + "score"}
                  className={`px-2 py-2 text-center text-xs ${
                    i === winningIndex
                      ? "bg-emerald-500/5 ring-1 ring-inset ring-emerald-500/30"
                      : ""
                  }`}
                  data-testid={`compare-score-${q}`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-mono text-base font-bold text-foreground">
                      {summary ? summary.score : "…"}
                    </span>
                    {summary ? (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset ${VERDICT_STYLE[summary.verdict].cls}`}
                      >
                        {VERDICT_STYLE[summary.verdict].label}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        {running ? "running…" : "—"}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {sortedCategoryOrder.map((cat) => {
            const rows = sortRows(providersByCategory.get(cat) ?? []);
            return (
              <CategoryRows
                key={cat}
                category={cat}
                rows={rows}
                queries={matrix.queries}
                cells={matrix.cells}
                winningIndex={winningIndex}
                rowBest={rowBest}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CategoryRows({
  category,
  rows,
  queries,
  cells,
  winningIndex,
  rowBest,
}: {
  category: ProviderCategory;
  rows: ProviderDescriptor[];
  queries: string[];
  cells: Map<string, ProviderResult>;
  winningIndex: number;
  rowBest: (providerId: string) => number;
}): React.ReactElement {
  return (
    <>
      <tr className="sticky top-0 border-y border-border bg-muted/60 backdrop-blur">
        <td
          colSpan={queries.length + 2}
          className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground"
        >
          {CATEGORY_LABEL[category]} · {rows.length}
        </td>
      </tr>
      {rows.map((p) => {
        const best = rowBest(p.id);
        return (
          <tr key={p.id} className="border-b border-border last:border-0">
            <th
              scope="row"
              className="sticky left-0 z-[1] bg-card px-3 py-2 text-left font-normal"
            >
              <div className="font-medium text-foreground">{p.name}</div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {p.id}
              </div>
            </th>
            {queries.map((q, i) => {
              const r = cells.get(makeKey(q, p.id));
              return (
                <td
                  key={q + i + p.id}
                  className={`px-2 py-2 text-center ${
                    i === winningIndex
                      ? "bg-emerald-500/5 ring-1 ring-inset ring-emerald-500/20"
                      : ""
                  }`}
                  data-testid={`cell-${q}-${p.id}`}
                  data-status={r?.status ?? "pending"}
                >
                  {r ? <Cell r={r} /> : <PendingDot />}
                </td>
              );
            })}
            <td className="px-2 py-2 text-center font-mono text-xs">
              {best >= 0 ? (
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    best === winningIndex
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {queries[best]}
                </span>
              ) : (
                <span className="text-muted-foreground/60">—</span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function Cell({ r }: { r: ProviderResult }): React.ReactElement {
  const style = STATUS_CELL[r.status];
  const detail = r.detail ?? r.error ?? "";
  const title = `${r.providerName}: ${style.label}${detail ? ` — ${detail}` : ""}${
    r.verifyUrl ? `\n${r.verifyUrl}` : ""
  }`;
  if (r.verifyUrl) {
    return (
      <a
        href={r.verifyUrl}
        target="_blank"
        rel="noreferrer"
        title={title}
        aria-label={title}
        className={`mx-auto inline-block h-3 w-3 rounded ${style.bg} ring-1 ring-inset ring-black/10 hover:opacity-90 dark:ring-white/10`}
      />
    );
  }
  return (
    <span
      title={title}
      aria-label={title}
      className={`mx-auto inline-block h-3 w-3 rounded ${style.bg} ring-1 ring-inset ring-black/10 dark:ring-white/10`}
    />
  );
}

function PendingDot(): React.ReactElement {
  return (
    <span
      className="mx-auto inline-block h-3 w-3 animate-pulse rounded-full bg-muted-foreground/30"
      aria-label="pending"
    />
  );
}

export function formatCompareMarkdown(matrix: LiveMatrix): string {
  const lines: string[] = [];
  lines.push(`# Compare: ${matrix.queries.join(" vs ")}`);
  lines.push("");
  const header = ["Provider", ...matrix.queries];
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`| ${header.map(() => "---").join(" | ")} |`);
  for (const p of matrix.providers) {
    const row = [`\`${p.id}\` ${p.name}`];
    for (const q of matrix.queries) {
      const r = matrix.cells.get(makeKey(q, p.id));
      row.push(r ? r.status : "—");
    }
    lines.push(`| ${row.join(" | ")} |`);
  }
  lines.push("");
  const verdictRow = matrix.summaries
    .map((s, i) => {
      const v = s?.verdict ?? "pending";
      const sc = s?.score;
      return `${matrix.queries[i]}: ${v}${sc === undefined ? "" : ` (${sc})`}`;
    })
    .join(" · ");
  lines.push(`**Verdicts:** ${verdictRow}`);
  return lines.join("\n") + "\n";
}

export function formatCompareCsv(matrix: LiveMatrix): string {
  const escape = (v: string): string =>
    /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const header = ["provider_id", "provider_name", "category", ...matrix.queries];
  const rows = [header.map(escape).join(",")];
  for (const p of matrix.providers) {
    const row = [p.id, p.name, p.category];
    for (const q of matrix.queries) {
      const r = matrix.cells.get(makeKey(q, p.id));
      row.push(r ? r.status : "");
    }
    rows.push(row.map(escape).join(","));
  }
  return rows.join("\n") + "\n";
}
