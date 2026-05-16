"use client";

import { useMemo, useState } from "react";
import type {
  CheckStatus,
  CheckSummary,
  ProviderCategory,
  ProviderResult,
  Verdict,
} from "@starter/shared";

export type BulkRow = {
  query: string;
  label?: string;
  summary: CheckSummary | null;
  results: ProviderResult[];
  done: boolean;
};

const CATEGORY_ORDER: ProviderCategory[] = [
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
    label: "AVAILABLE",
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

const STATUS_DOT: Record<CheckStatus, { glyph: string; cls: string; label: string }> = {
  taken: { glyph: "●", cls: "text-rose-600 dark:text-rose-400", label: "taken" },
  partial: { glyph: "●", cls: "text-amber-600 dark:text-amber-400", label: "partial" },
  manual_verify: { glyph: "●", cls: "text-sky-600 dark:text-sky-400", label: "verify" },
  unknown: { glyph: "●", cls: "text-zinc-500 dark:text-zinc-500", label: "unknown" },
  available: { glyph: "●", cls: "text-emerald-600 dark:text-emerald-400", label: "available" },
  error: { glyph: "●", cls: "text-fuchsia-600 dark:text-fuchsia-400", label: "error" },
};

type SortKey = "name" | "verdict" | "domain" | "trademark";
type SortDir = "asc" | "desc";

const VERDICT_RANK: Record<Verdict, number> = {
  likely_available: 0,
  mixed: 1,
  likely_taken: 2,
};

function categoryRollup(
  results: ProviderResult[],
  category: ProviderCategory,
): Record<CheckStatus, number> {
  const r: Record<CheckStatus, number> = {
    available: 0,
    taken: 0,
    partial: 0,
    manual_verify: 0,
    unknown: 0,
    error: 0,
  };
  for (const x of results) {
    if (x.category === category) r[x.status]++;
  }
  return r;
}

function clearScore(
  results: ProviderResult[],
  category: ProviderCategory,
): number {
  const r = categoryRollup(results, category);
  const total = r.available + r.taken + r.partial + r.manual_verify + r.unknown + r.error;
  if (total === 0) return -1;
  return (r.available - r.taken - r.partial) / total;
}

export function BulkMatrix({
  rows,
  running,
}: {
  rows: BulkRow[];
  running: boolean;
}): React.ReactElement {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: SortKey): void {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.query.localeCompare(b.query) * dir;
        case "verdict": {
          const av = a.summary ? VERDICT_RANK[a.summary.verdict] : 99;
          const bv = b.summary ? VERDICT_RANK[b.summary.verdict] : 99;
          return (av - bv) * dir;
        }
        case "domain":
          return (clearScore(b.results, "domain") - clearScore(a.results, "domain")) * dir;
        case "trademark":
          return (clearScore(b.results, "trademark") - clearScore(a.results, "trademark")) * dir;
      }
    });
  }, [rows, sortKey, sortDir]);

  function arrow(key: SortKey): string {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "name" : "names"}
          {running ? " · running…" : ""}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="export-csv"
            onClick={() => downloadCsv(sorted)}
            disabled={rows.length === 0}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-foreground/40 disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => downloadMarkdown(sorted)}
            disabled={rows.length === 0}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-foreground/40 disabled:opacity-50"
          >
            Export Markdown
          </button>
          <button
            type="button"
            onClick={() => downloadJson(sorted)}
            disabled={rows.length === 0}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-foreground/40 disabled:opacity-50"
          >
            Export JSON
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full border-collapse text-left text-sm" data-testid="bulk-matrix">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <button
                  type="button"
                  onClick={() => toggleSort("name")}
                  className="font-mono uppercase hover:text-foreground"
                >
                  Name{arrow("name")}
                </button>
              </th>
              {CATEGORY_ORDER.map((c) => {
                const sortable = c === "domain" || c === "trademark";
                return (
                  <th
                    key={c}
                    className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c as SortKey)}
                        className="hover:text-foreground"
                      >
                        {CATEGORY_LABEL[c]}
                        {arrow(c as SortKey)}
                      </button>
                    ) : (
                      CATEGORY_LABEL[c]
                    )}
                  </th>
                );
              })}
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <button
                  type="button"
                  onClick={() => toggleSort("verdict")}
                  className="hover:text-foreground"
                >
                  Verdict{arrow("verdict")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <MatrixRow key={row.query} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatrixRow({ row }: { row: BulkRow }): React.ReactElement {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/40">
      <td className="px-3 py-2 align-top">
        <div className="font-mono text-sm text-foreground">{row.query}</div>
        {row.label ? (
          <div className="text-xs text-muted-foreground">{row.label}</div>
        ) : null}
      </td>
      {CATEGORY_ORDER.map((c) => (
        <td key={c} className="px-2 py-2 align-top">
          <CategoryCell row={row} category={c} />
        </td>
      ))}
      <td className="px-3 py-2 align-top text-right">
        {row.summary ? (
          <VerdictPill verdict={row.summary.verdict} />
        ) : (
          <span className="font-mono text-xs text-muted-foreground/60">
            {row.done ? "—" : "…"}
          </span>
        )}
      </td>
    </tr>
  );
}

function CategoryCell({
  row,
  category,
}: {
  row: BulkRow;
  category: ProviderCategory;
}): React.ReactElement {
  const inCat = row.results.filter((r) => r.category === category);
  if (inCat.length === 0) {
    return (
      <div
        className="h-6 w-full animate-pulse rounded bg-muted/60"
        aria-label={`${CATEGORY_LABEL[category]} pending`}
      />
    );
  }
  const roll = categoryRollup(inCat, category);
  const tooltipLines = inCat
    .slice()
    .sort((a, b) => a.providerId.localeCompare(b.providerId))
    .map((r) => `${r.status.padEnd(13)} ${r.providerId}`)
    .join("\n");

  return (
    <div
      className="group relative inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-2 py-0.5 font-mono text-[11px]"
      title={tooltipLines}
    >
      {(["taken", "partial", "manual_verify", "available", "unknown", "error"] as CheckStatus[])
        .filter((s) => roll[s] > 0)
        .map((s) => (
          <span key={s} className={`${STATUS_DOT[s].cls} inline-flex items-center gap-0.5`}>
            <span aria-hidden>{STATUS_DOT[s].glyph}</span>
            <span>{roll[s]}</span>
          </span>
        ))}
    </div>
  );
}

function VerdictPill({ verdict }: { verdict: Verdict }): React.ReactElement {
  const s = VERDICT_STYLE[verdict];
  return (
    <span
      data-testid="bulk-verdict"
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

function downloadCsv(rows: BulkRow[]): void {
  const head = [
    "query",
    "label",
    "verdict",
    ...CATEGORY_ORDER.flatMap((c) => [
      `${c}_available`,
      `${c}_taken`,
      `${c}_partial`,
      `${c}_verify`,
      `${c}_unknown`,
      `${c}_error`,
    ]),
  ];
  const lines = [head.join(",")];
  for (const row of rows) {
    const cells: string[] = [
      csvEscape(row.query),
      csvEscape(row.label ?? ""),
      row.summary?.verdict ?? "",
    ];
    for (const c of CATEGORY_ORDER) {
      const r = categoryRollup(row.results, c);
      cells.push(
        String(r.available),
        String(r.taken),
        String(r.partial),
        String(r.manual_verify),
        String(r.unknown),
        String(r.error),
      );
    }
    lines.push(cells.join(","));
  }
  triggerDownload("bulk-check.csv", "text/csv;charset=utf-8", lines.join("\n"));
}

function downloadMarkdown(rows: BulkRow[]): void {
  const head = ["name", "label", "verdict", ...CATEGORY_ORDER.map((c) => CATEGORY_LABEL[c])];
  const lines = [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
  ];
  for (const row of rows) {
    const cells: string[] = [
      row.query,
      row.label ?? "",
      row.summary?.verdict ?? "—",
    ];
    for (const c of CATEGORY_ORDER) {
      const r = categoryRollup(row.results, c);
      const parts: string[] = [];
      if (r.available) parts.push(`${r.available} avail`);
      if (r.taken) parts.push(`${r.taken} taken`);
      if (r.partial) parts.push(`${r.partial} partial`);
      if (r.manual_verify) parts.push(`${r.manual_verify} verify`);
      if (r.unknown) parts.push(`${r.unknown} unknown`);
      if (r.error) parts.push(`${r.error} err`);
      cells.push(parts.join(" / ") || "—");
    }
    lines.push(`| ${cells.join(" | ")} |`);
  }
  triggerDownload(
    "bulk-check.md",
    "text/markdown;charset=utf-8",
    lines.join("\n"),
  );
}

function downloadJson(rows: BulkRow[]): void {
  const payload = rows.map((row) => ({
    query: row.query,
    label: row.label,
    summary: row.summary,
    results: row.results,
  }));
  triggerDownload(
    "bulk-check.json",
    "application/json;charset=utf-8",
    JSON.stringify(payload, null, 2),
  );
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function triggerDownload(filename: string, mime: string, content: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
