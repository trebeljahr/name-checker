#!/usr/bin/env node
import pc from "picocolors";
import {
  allProviders,
  runCheck,
  suggestVariants,
  type CheckRequest,
  type CheckSummary,
  type ProviderResult,
  type Verdict,
} from "@starter/shared";
import { parseArgs, type ParsedArgs } from "./args.js";
import {
  formatCompareMatrix,
  formatCsv,
  formatMarkdown,
  formatProviderRow,
  formatSummary,
  paintStatus,
  strictHasFailure,
  verdictHasFailure,
} from "./format.js";
import { HELP } from "./help.js";

async function main(): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${HELP}\n`);
    return 2;
  }

  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }

  if (args.list) {
    listProviders();
    return 0;
  }

  const names = args.compare ?? (args.query ? [args.query] : []);
  if (names.length === 0) {
    process.stderr.write("error: missing <name>\n\n" + HELP);
    return 2;
  }

  const baseReq = (query: string): CheckRequest => ({
    query,
    categories: args.categories,
    providers: args.providers,
    excludeProviders: args.excludeProviders,
    timeoutMs: args.timeoutMs,
    concurrency: args.concurrency,
  });

  const isCompare = (args.compare?.length ?? 0) > 0;
  const wantsStructured = args.json || args.csv || args.md;
  const isTty = process.stdout.isTTY && !wantsStructured && !isCompare;

  const maxName = Math.max(...allProviders.map((p) => p.name.length));
  const onResult = isTty
    ? (r: ProviderResult): void => {
        process.stdout.write(formatProviderRow(r, maxName) + "\n");
      }
    : undefined;

  if (isTty) {
    process.stdout.write(
      pc.bold(`\nname-check: ${pc.cyan(names[0]!)}\n`) +
        pc.gray("Running providers…\n\n"),
    );
  }

  const summaries: CheckSummary[] = await Promise.all(
    names.map((n) => runCheck(baseReq(n), n === names[0] ? onResult : undefined)),
  );

  const variantSummaries = args.variants > 0 && !isCompare && names[0]
    ? await runVariantChecks(names[0], args.variants, args.timeoutMs, args.concurrency)
    : null;

  if (args.json) {
    const base = isCompare ? summaries : summaries[0];
    const payload = variantSummaries
      ? {
          ...(base as CheckSummary),
          variants: {
            query: names[0]!,
            suggestions: variantSummaries.map((v) => ({
              name: v.query,
              verdict: v.verdict,
              rollup: v.rollup,
            })),
          },
        }
      : base;
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  } else if (args.csv) {
    process.stdout.write(formatCsv(summaries));
  } else if (args.md) {
    for (const s of summaries) process.stdout.write(formatMarkdown(s));
  } else if (isCompare) {
    process.stdout.write(formatCompareMatrix(summaries) + "\n");
  } else if (isTty) {
    process.stdout.write("\n");
    process.stdout.write(formatSummary(summaries[0]!, args.showAll));
  } else {
    for (const r of summaries[0]!.results)
      process.stdout.write(
        `${paintStatus(r.status)}\t${r.providerId}\t${r.detail ?? ""}\t${r.verifyUrl ?? ""}\n`,
      );
  }

  if (variantSummaries && !args.json && !args.csv && !args.md) {
    process.stdout.write(formatVariants(names[0]!, variantSummaries, isTty));
  }

  if (args.strict) return strictHasFailure(summaries) ? 1 : 0;
  return verdictHasFailure(summaries) ? 1 : 0;
}

const VARIANT_PROVIDERS = ["domain-com", "npm", "github-user", "bluesky"];

async function runVariantChecks(
  query: string,
  count: number,
  timeoutMs: number | undefined,
  concurrency: number | undefined,
): Promise<CheckSummary[]> {
  const suggestions = suggestVariants(query, { count });
  if (suggestions.length === 0) return [];
  return Promise.all(
    suggestions.map((name) =>
      runCheck({
        query: name,
        providers: VARIANT_PROVIDERS,
        timeoutMs,
        concurrency,
      }),
    ),
  );
}

const VERDICT_SHORT: Record<Verdict, string> = {
  likely_available: "AVAIL",
  likely_taken: "TAKEN",
  mixed: "MIXED",
};

function paintVariantVerdict(v: Verdict, color: boolean): string {
  const label = VERDICT_SHORT[v];
  if (!color) return label;
  if (v === "likely_available") return pc.green(label);
  if (v === "likely_taken") return pc.red(label);
  return pc.yellow(label);
}

function formatVariants(
  query: string,
  variants: CheckSummary[],
  color: boolean,
): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(
    color
      ? pc.bold(`Similar names for ${pc.cyan(query)}`)
      : `Similar names for ${query}`,
  );
  const subtitle = `(${VARIANT_PROVIDERS.join(", ")}) — ${variants.length} candidates`;
  lines.push(color ? pc.gray(subtitle) : subtitle);
  lines.push("");
  const maxName = Math.max(...variants.map((v) => v.query.length), 4);
  for (const v of variants) {
    const verdict = paintVariantVerdict(v.verdict, color);
    const name = color ? pc.bold(v.query.padEnd(maxName)) : v.query.padEnd(maxName);
    const r = v.rollup;
    const rollup = `avail:${r.available} taken:${r.taken} part:${r.partial} unkn:${r.unknown} err:${r.error}`;
    const detail = color ? pc.gray(rollup) : rollup;
    lines.push(`  ${verdict}  ${name}  ${detail}`);
  }
  lines.push("");
  return lines.join("\n");
}

function listProviders(): void {
  const byCat = new Map<string, typeof allProviders>();
  for (const p of allProviders) {
    const arr = byCat.get(p.category) ?? [];
    arr.push(p);
    byCat.set(p.category, arr);
  }
  for (const [cat, items] of byCat) {
    process.stdout.write(`\n${pc.bold(pc.underline(cat.toUpperCase()))}\n`);
    for (const p of items) {
      const desc = p.description ? pc.gray(` — ${p.description}`) : "";
      process.stdout.write(`  ${pc.cyan(p.id.padEnd(24))} ${p.name}${desc}\n`);
    }
  }
  process.stdout.write(`\n${allProviders.length} providers total.\n`);
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
  },
);
