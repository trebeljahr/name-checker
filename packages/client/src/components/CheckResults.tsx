"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CheckStatus,
  CheckSummary,
  ProviderCategory,
  ProviderResult,
  Subverdict,
  Verdict,
} from "@starter/shared";
import { ALL_STATUSES } from "@starter/shared/constants";
import { TrademarkDisclaimer } from "./Disclaimer";
import {
  CATEGORY_LABEL_LONG as CATEGORY_LABEL,
  CATEGORY_ORDER,
  STATUS_STYLE,
  SUBVERDICT_STYLE,
  VERDICT_STYLE_LONG as VERDICT_STYLE,
} from "@/lib/ui-constants";

function scoreCls(score: number): string {
  if (score >= 70) return "text-emerald-700 dark:text-emerald-300";
  if (score >= 35) return "text-amber-700 dark:text-amber-300";
  return "text-rose-700 dark:text-rose-300";
}

const STATUS_PRIORITY: Record<CheckStatus, number> = {
  taken: 0,
  partial: 1,
  manual_verify: 2,
  unknown: 3,
  available: 4,
  error: 5,
};

export function StatusBadge({ status }: { status: CheckStatus }): React.ReactElement {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-mono font-medium ring-1 ring-inset ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

export function VerdictBadge({
  verdict,
  rollup,
  score,
}: {
  verdict: Verdict;
  rollup: CheckSummary["rollup"];
  score?: number;
}): React.ReactElement {
  const s = VERDICT_STYLE[verdict];
  return (
    <div className="flex items-center gap-3">
      <div className="font-mono text-xs text-muted-foreground">
        avail:{rollup.available} · taken:{rollup.taken} · part:{rollup.partial} ·
        check:{rollup.manual_verify} · err:{rollup.error}
      </div>
      {typeof score === "number" && (
        <div
          data-testid="score-badge"
          className={`font-mono text-sm font-bold ${scoreCls(score)}`}
        >
          {score}/100
        </div>
      )}
      <span
        data-testid="verdict-badge"
        className={`rounded px-2 py-1 text-xs font-bold ring-1 ring-inset ${s.cls}`}
      >
        {s.label}
      </span>
    </div>
  );
}

export function SubverdictStrip({
  subverdicts,
  breakdown,
}: {
  subverdicts: Record<ProviderCategory, Subverdict>;
  breakdown?: CheckSummary["scoreBreakdown"];
}): React.ReactElement {
  const topReasons = (breakdown ?? [])
    .slice()
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 4);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card/60 p-3">
      <div
        data-testid="subverdict-strip"
        className="flex flex-wrap items-center gap-2"
      >
        {CATEGORY_ORDER.map((c) => {
          const v = subverdicts[c];
          const style = SUBVERDICT_STYLE[v];
          return (
            <span
              key={c}
              data-testid={`subverdict-${c}`}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-mono ring-1 ring-inset ${style.cls}`}
            >
              <span className="opacity-70">{CATEGORY_LABEL[c]}</span>
              <span className="font-bold">{style.label}</span>
            </span>
          );
        })}
      </div>
      {topReasons.length > 0 && (
        <ul className="font-mono text-xs text-muted-foreground">
          {topReasons.map((e, i) => (
            <li key={`${e.providerId}-${i}`}>
              <span
                className={
                  e.delta < 0
                    ? "text-rose-700 dark:text-rose-300"
                    : "text-emerald-700 dark:text-emerald-300"
                }
              >
                {e.delta > 0 ? `+${e.delta}` : e.delta}
              </span>{" "}
              {e.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProviderRow({ r }: { r: ProviderResult }): React.ReactElement {
  return (
    <li className="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-0 md:flex-row md:items-start md:gap-4">
      <div className="md:w-24 shrink-0">
        <StatusBadge status={r.status} />
      </div>
      <div className="md:w-56 shrink-0">
        <div className="font-medium text-foreground">{r.providerName}</div>
        <div className="font-mono text-xs text-muted-foreground">{r.providerId}</div>
      </div>
      <div className="flex-1 text-sm text-muted-foreground">
        {r.detail ?? r.error ?? "—"}
        {r.evidence && r.evidence.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
            {r.evidence.slice(0, 3).map((e, i) => (
              <li key={i}>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-2 hover:text-foreground hover:underline"
                >
                  {e.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="md:w-32 shrink-0 text-right">
        {r.verifyUrl ? (
          <a
            href={r.verifyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-xs text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
          >
            verify ↗
          </a>
        ) : null}
        <div className="font-mono text-xs text-muted-foreground/70">
          {r.durationMs}ms
        </div>
      </div>
    </li>
  );
}

function sortByStatus(rs: ProviderResult[]): ProviderResult[] {
  return rs
    .slice()
    .sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
}

export function CategoryGroup({
  category,
  results,
}: {
  category: ProviderCategory;
  results: ProviderResult[];
}): React.ReactElement {
  const sorted = useMemo(() => sortByStatus(results), [results]);
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          {CATEGORY_LABEL[category]}
        </h2>
        <span className="font-mono text-xs text-muted-foreground">
          {results.length}
        </span>
      </header>
      {category === "trademark" && <TrademarkDisclaimer />}
      <ul>
        {sorted.map((r) => (
          <ProviderRow key={r.providerId} r={r} />
        ))}
      </ul>
    </section>
  );
}

function parseHideHash(hash: string): Set<CheckStatus> {
  const out = new Set<CheckStatus>();
  if (!hash) return out;
  const part = hash
    .replace(/^#/, "")
    .split("&")
    .find((s) => s.startsWith("hide="));
  if (!part) return out;
  let raw: string;
  try {
    raw = decodeURIComponent(part.slice(5));
  } catch {
    return out;
  }
  for (const tok of raw.split(",")) {
    if ((ALL_STATUSES as readonly string[]).includes(tok)) out.add(tok as CheckStatus);
  }
  return out;
}

function writeHideHash(hidden: Set<CheckStatus>): void {
  if (typeof window === "undefined") return;
  const list = ALL_STATUSES.filter((s) => hidden.has(s));
  const next = list.length ? `#hide=${encodeURIComponent(list.join(","))}` : "";
  const target = `${window.location.pathname}${window.location.search}${next}`;
  if (window.location.hash !== next) {
    window.history.replaceState(null, "", target);
  }
}

export function ResultsView({
  results,
  summary,
  running,
  query,
}: {
  results: ProviderResult[];
  summary: CheckSummary | null;
  running: boolean;
  query: string;
}): React.ReactElement {
  const [hidden, setHidden] = useState<Set<CheckStatus>>(new Set());
  const [hydrated, setHydrated] = useState<boolean>(false);

  useEffect(() => {
    setHidden(parseHideHash(window.location.hash));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) writeHideHash(hidden);
  }, [hidden, hydrated]);

  function toggle(s: CheckStatus): void {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const counts: Record<CheckStatus, number> = {
    available: 0,
    taken: 0,
    partial: 0,
    manual_verify: 0,
    unknown: 0,
    error: 0,
  };
  for (const r of results) counts[r.status]++;

  const visible = results.filter((r) => !hidden.has(r.status));
  const grouped = new Map<ProviderCategory, ProviderResult[]>();
  for (const r of visible) {
    const arr = grouped.get(r.category) ?? [];
    arr.push(r);
    grouped.set(r.category, arr);
  }

  return (
    <div className="space-y-4">
      {(running || results.length > 0) && (
        <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-card/60 p-3">
          <div className="text-sm text-foreground">
            {running ? (
              <span>
                Checking <span className="font-mono">{query}</span>…{" "}
                {results.length} done
              </span>
            ) : summary ? (
              <span>
                Done. <span className="font-mono">{summary.totalMs}ms</span> ·{" "}
                {results.length} providers
              </span>
            ) : null}
          </div>
          {summary && (
            <VerdictBadge
              verdict={summary.verdict}
              rollup={summary.rollup}
              score={summary.score}
            />
          )}
        </div>
      )}

      {summary?.subverdicts && (
        <SubverdictStrip
          subverdicts={summary.subverdicts}
          breakdown={summary.scoreBreakdown}
        />
      )}

      {results.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="status-filter">
          {ALL_STATUSES.map((s) => {
            const active = !hidden.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                data-testid={`filter-${s}`}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1 text-xs font-mono transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/50"
                }`}
              >
                {STATUS_STYLE[s].label}{" "}
                <span className="opacity-60">{counts[s]}</span>
              </button>
            );
          })}
        </div>
      )}

      {CATEGORY_ORDER.filter((c) => grouped.get(c)?.length).map((c) => (
        <CategoryGroup key={c} category={c} results={grouped.get(c)!} />
      ))}
    </div>
  );
}
