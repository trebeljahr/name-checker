import pc from "picocolors";
import {
  CATEGORIES,
  STATUS_SHORT_LABEL,
  SUBVERDICT_LABEL,
  type CheckStatus,
  type ProviderResult,
  type CheckSummary,
  type ProviderCategory,
  type Subverdict,
} from "@starter/shared";

const SUBVERDICT_COLOR: Record<Subverdict, (s: string) => string> = {
  clear: pc.green,
  caution: pc.yellow,
  blocked: pc.red,
};

function paintSubverdict(s: Subverdict): string {
  return SUBVERDICT_COLOR[s](SUBVERDICT_LABEL[s]);
}

const STATUS_COLOR: Record<CheckStatus, (s: string) => string> = {
  available: pc.green,
  taken: pc.red,
  partial: pc.yellow,
  manual_verify: pc.cyan,
  unknown: pc.gray,
  error: pc.magenta,
};

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function paintStatus(s: CheckStatus): string {
  return STATUS_COLOR[s](STATUS_SHORT_LABEL[s]);
}

export function getTermWidth(): number {
  const col = process.stdout.columns;
  if (typeof col === "number" && col > 0) return col;
  const env = Number(process.env.COLUMNS);
  if (Number.isFinite(env) && env > 0) return env;
  return 100;
}

function visibleLen(s: string): number {
  return s.replace(ANSI_RE, "").length;
}

function truncate(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  if (max === 1) return "…";
  return s.slice(0, max - 1) + "…";
}

function padVisible(s: string, width: number): string {
  const v = visibleLen(s);
  if (v >= width) return s;
  return s + " ".repeat(width - v);
}

export function formatProviderRow(r: ProviderResult, maxName: number): string {
  const width = getTermWidth();
  const status = paintStatus(r.status);
  const name = r.providerName.padEnd(maxName);
  const rawDetail = r.detail ?? r.error ?? "";
  const url = r.verifyUrl ?? "";
  const urlSuffix = url ? ` → ${url}` : "";
  const fixed = 2 + visibleLen(status) + 2 + maxName + (rawDetail ? 2 : 0);
  const available = Math.max(0, width - fixed - urlSuffix.length);
  const detail = truncate(rawDetail, available);
  const detailPart = detail ? `  ${detail}` : "";
  const urlPart = url ? pc.gray(urlSuffix) : "";
  return `  ${status}  ${pc.bold(name)}${detailPart}${urlPart}`;
}

export function formatSummary(summary: CheckSummary, showAll: boolean): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(pc.bold(`name-check: ${pc.cyan(summary.query)}`));
  lines.push(pc.gray(`${summary.results.length} providers · ${summary.totalMs}ms`));
  lines.push("");

  const byCategory = new Map<string, ProviderResult[]>();
  for (const r of summary.results) {
    const arr = byCategory.get(r.category) ?? [];
    arr.push(r);
    byCategory.set(r.category, arr);
  }
  const maxName = Math.max(
    ...summary.results.map((r) => r.providerName.length),
  );

  for (const [cat, items] of byCategory) {
    const sv = summary.subverdicts?.[cat as ProviderCategory];
    const header = sv
      ? `${pc.bold(pc.underline(cat.toUpperCase()))}  ${paintSubverdict(sv)}`
      : pc.bold(pc.underline(cat.toUpperCase()));
    lines.push(header);
    const visible = showAll
      ? items
      : items.filter((i) => i.status !== "unknown" || items.length < 5);
    for (const it of visible) lines.push(formatProviderRow(it, maxName));
    if (visible.length < items.length)
      lines.push(pc.gray(`  …${items.length - visible.length} more (use --all)`));
    lines.push("");
  }

  const r = summary.rollup;
  lines.push(pc.bold("ROLLUP"));
  lines.push(
    `  ${pc.green(`avail:${r.available}`)}  ${pc.red(`taken:${r.taken}`)}  ${pc.yellow(`part:${r.partial}`)}  ${pc.cyan(`check:${r.manual_verify}`)}  ${pc.gray(`unkn:${r.unknown}`)}  ${pc.magenta(`err:${r.error}`)}`,
  );

  if (typeof summary.score === "number") {
    lines.push("");
    lines.push(pc.bold(`Score: ${paintScore(summary.score)}/100`));
    if (summary.subverdicts) {
      const cats = CATEGORIES;
      const cells = cats.map(
        (c) => `${pc.gray(c)}:${paintSubverdict(summary.subverdicts[c])}`,
      );
      lines.push("  " + cells.join("  "));
    }
    if (summary.scoreBreakdown && summary.scoreBreakdown.length > 0) {
      const top = summary.scoreBreakdown
        .slice()
        .sort((a, b) => a.delta - b.delta)
        .slice(0, 6);
      lines.push(pc.gray("  why:"));
      for (const e of top) {
        const sign = e.delta > 0 ? `+${e.delta}` : `${e.delta}`;
        const colored = e.delta < 0 ? pc.red(sign) : pc.green(sign);
        lines.push(`    ${colored}  ${pc.gray(e.reason)}`);
      }
    }
  }

  const verdict =
    summary.verdict === "likely_available"
      ? pc.green("LIKELY AVAILABLE")
      : summary.verdict === "likely_taken"
        ? pc.red("LIKELY TAKEN")
        : pc.yellow("MIXED — verify manually");
  lines.push("");
  lines.push(pc.bold(`Verdict: ${verdict}`));
  lines.push("");
  return lines.join("\n");
}

function paintScore(score: number): string {
  if (score >= 70) return pc.green(String(score));
  if (score >= 35) return pc.yellow(String(score));
  return pc.red(String(score));
}

function csvField(v: string | number | undefined): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function formatCsv(summaries: CheckSummary[]): string {
  const header =
    "query,providerId,providerName,category,status,detail,verifyUrl,durationMs";
  const rows: string[] = [header];
  for (const summary of summaries) {
    for (const r of summary.results) {
      rows.push(
        [
          csvField(summary.query),
          csvField(r.providerId),
          csvField(r.providerName),
          csvField(r.category),
          csvField(r.status),
          csvField(r.detail ?? r.error ?? ""),
          csvField(r.verifyUrl ?? ""),
          csvField(r.durationMs),
        ].join(","),
      );
    }
  }
  return rows.join("\n") + "\n";
}

export function formatMarkdown(summary: CheckSummary): string {
  const lines: string[] = [];
  lines.push(`# name-check: ${summary.query}`);
  lines.push(
    `**Verdict:** ${summary.verdict} · **Score:** ${summary.score}/100 · ${summary.totalMs}ms · ${summary.results.length} providers`,
  );
  const r = summary.rollup;
  lines.push(
    `avail:${r.available} · taken:${r.taken} · part:${r.partial} · check:${r.manual_verify} · unkn:${r.unknown} · err:${r.error}`,
  );
  if (summary.subverdicts) {
    lines.push(
      CATEGORIES.map((c) => `${c}:${summary.subverdicts[c]}`).join(" · "),
    );
  }

  const byCat = new Map<ProviderCategory, ProviderResult[]>();
  for (const x of summary.results) {
    const arr = byCat.get(x.category) ?? [];
    arr.push(x);
    byCat.set(x.category, arr);
  }
  for (const [cat, items] of byCat) {
    lines.push("");
    lines.push(`## ${cat.toUpperCase()}`);
    lines.push("");
    lines.push("| Status | Provider | Detail | Verify |");
    lines.push("|---|---|---|---|");
    for (const it of items) {
      const verify = it.verifyUrl ? `[link](${it.verifyUrl})` : "";
      const detail = (it.detail ?? it.error ?? "")
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
      lines.push(
        `| ${it.status.toUpperCase()} | \`${it.providerId}\` ${it.providerName} | ${detail} | ${verify} |`,
      );
    }
  }
  return lines.join("\n") + "\n";
}

function paintVerdict(v: CheckSummary["verdict"]): string {
  if (v === "likely_available") return pc.green("AVAIL");
  if (v === "likely_taken") return pc.red("TAKEN");
  return pc.yellow("MIXED");
}

export function formatCompareMatrix(summaries: CheckSummary[]): string {
  if (summaries.length === 0) return "";

  const providerOrder: {
    id: string;
    name: string;
    category: ProviderCategory;
  }[] = [];
  const seen = new Set<string>();
  for (const s of summaries) {
    for (const r of s.results) {
      if (!seen.has(r.providerId)) {
        seen.add(r.providerId);
        providerOrder.push({
          id: r.providerId,
          name: r.providerName,
          category: r.category,
        });
      }
    }
  }

  const lookup = new Map<string, Map<string, ProviderResult>>();
  for (const s of summaries) {
    const m = new Map<string, ProviderResult>();
    for (const r of s.results) m.set(r.providerId, r);
    lookup.set(s.query, m);
  }

  const providerColWidth = Math.max(
    "PROVIDER".length,
    ...providerOrder.map((p) => p.name.length),
  );
  const queryColWidth = Math.max(
    5,
    ...summaries.map((s) => s.query.length),
  );

  const sep = " │ ";
  const lines: string[] = [];

  lines.push("");
  lines.push(pc.bold(`name-check compare: ${summaries.map((s) => pc.cyan(s.query)).join(", ")}`));
  lines.push("");

  const headerCells = [
    pc.bold("PROVIDER".padEnd(providerColWidth)),
    ...summaries.map((s) => pc.bold(padVisible(pc.cyan(s.query), queryColWidth))),
  ];
  lines.push("  " + headerCells.join(sep));

  const ruleCells = [
    "─".repeat(providerColWidth),
    ...summaries.map(() => "─".repeat(queryColWidth)),
  ];
  lines.push("  " + ruleCells.join("─┼─"));

  const verdictCells = [
    pc.bold("VERDICT".padEnd(providerColWidth)),
    ...summaries.map((s) => padVisible(paintVerdict(s.verdict), queryColWidth)),
  ];
  lines.push("  " + verdictCells.join(sep));
  lines.push("");

  const byCat = new Map<ProviderCategory, typeof providerOrder>();
  for (const p of providerOrder) {
    const arr = byCat.get(p.category) ?? [];
    arr.push(p);
    byCat.set(p.category, arr);
  }

  for (const [cat, items] of byCat) {
    lines.push(pc.bold(pc.underline(cat.toUpperCase())));
    for (const p of items) {
      const cells = [
        p.name.padEnd(providerColWidth),
        ...summaries.map((s) => {
          const r = lookup.get(s.query)?.get(p.id);
          const badge = r ? paintStatus(r.status) : pc.gray("---  ");
          return padVisible(badge, queryColWidth);
        }),
      ];
      lines.push("  " + cells.join(sep));
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function strictHasFailure(summaries: CheckSummary[]): boolean {
  return summaries.some((s) =>
    s.results.some((r) => r.status === "taken" || r.status === "partial"),
  );
}

export function verdictHasFailure(summaries: CheckSummary[]): boolean {
  return summaries.some((s) => s.verdict === "likely_taken");
}
