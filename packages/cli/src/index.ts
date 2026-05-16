#!/usr/bin/env node
import pc from "picocolors";
import {
  allProviders,
  runCheck,
  type CheckRequest,
  type ProviderResult,
} from "@starter/shared";
import { parseArgs } from "./args.js";
import { formatProviderRow, formatSummary, paintStatus } from "./format.js";
import { HELP } from "./help.js";

async function main(): Promise<number> {
  let args;
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

  if (!args.query) {
    process.stderr.write("error: missing <name>\n\n" + HELP);
    return 2;
  }

  const req: CheckRequest = {
    query: args.query,
    categories: args.categories,
    providers: args.providers,
    excludeProviders: args.excludeProviders,
    timeoutMs: args.timeoutMs,
    concurrency: args.concurrency,
  };

  const isTty = process.stdout.isTTY && !args.json;
  const maxName = Math.max(...allProviders.map((p) => p.name.length));
  const onResult = isTty
    ? (r: ProviderResult): void => {
        process.stdout.write(formatProviderRow(r, maxName) + "\n");
      }
    : undefined;

  if (isTty) {
    process.stdout.write(
      pc.bold(`\nname-check: ${pc.cyan(args.query)}\n`) +
        pc.gray("Running providers…\n\n"),
    );
  }

  const summary = await runCheck(req, onResult);

  if (args.json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  } else if (isTty) {
    process.stdout.write("\n");
    process.stdout.write(formatSummary(summary, args.showAll));
  } else {
    for (const r of summary.results)
      process.stdout.write(
        `${paintStatus(r.status)}\t${r.providerId}\t${r.detail ?? ""}\t${r.verifyUrl ?? ""}\n`,
      );
  }

  return summary.verdict === "likely_taken" ? 1 : 0;
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
