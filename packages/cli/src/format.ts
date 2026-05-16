import pc from "picocolors";
import type { CheckStatus, ProviderResult, CheckSummary } from "@starter/shared";

const STATUS_LABEL: Record<CheckStatus, string> = {
  available: "AVAIL",
  taken: "TAKEN",
  partial: "PART ",
  manual_verify: "CHECK",
  unknown: "UNKN ",
  error: "ERROR",
};

const STATUS_COLOR: Record<CheckStatus, (s: string) => string> = {
  available: pc.green,
  taken: pc.red,
  partial: pc.yellow,
  manual_verify: pc.cyan,
  unknown: pc.gray,
  error: pc.magenta,
};

export function paintStatus(s: CheckStatus): string {
  return STATUS_COLOR[s](STATUS_LABEL[s]);
}

export function formatProviderRow(r: ProviderResult, maxName: number): string {
  const status = paintStatus(r.status);
  const name = r.providerName.padEnd(maxName);
  const detail = r.detail ?? r.error ?? "";
  const url = r.verifyUrl ? pc.gray(` → ${r.verifyUrl}`) : "";
  return `  ${status}  ${pc.bold(name)}  ${detail}${url}`;
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
    lines.push(pc.bold(pc.underline(cat.toUpperCase())));
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
