#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  allProviders,
  batchCheckRequestSchema,
  checkRequestSchema,
  findFreeNamesRequestSchema,
  runCheck,
  runCheckBatch,
  type CheckSummary,
  type FreeAnywhereResult,
  type ProviderCategory,
  type ProviderResult,
} from "@starter/shared";

const DEFAULT_REQUIRED_PROVIDERS = [
  "domain-com",
  "npm",
  "github-user",
  "bluesky",
];

const server = new Server(
  { name: "name-check-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "check_name",
      description:
        "Check whether a name is available across trademarks (USPTO/EUIPO/DPMA/WIPO/UKIPO/CIPO/IPAU via TMview + verify links), domains (RDAP across many TLDs), social handles (Bluesky/GitHub/X/TikTok/YouTube/itch.io/Twitch/Reddit/IG/Threads/Mastodon/Patreon/Ko-fi/Substack/Steam/LinkedIn/Pinterest), app stores (Apple/Google/MS/Steam/itch), package registries (npm/PyPI/crates/RubyGems/Maven), and code hosts (GitHub repo search). Returns per-provider status and an overall verdict.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name to check." },
          categories: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "trademark",
                "domain",
                "social",
                "appstore",
                "package",
                "code",
              ],
            },
            description: "Limit to these provider categories.",
          },
          providers: {
            type: "array",
            items: { type: "string" },
            description: "Explicit provider id allowlist.",
          },
          excludeProviders: {
            type: "array",
            items: { type: "string" },
            description: "Provider ids to skip.",
          },
          timeoutMs: { type: "number", description: "Per-provider timeout (default 12000)." },
          concurrency: { type: "number", description: "Max parallel requests (default 10)." },
        },
        required: ["query"],
      },
    },
    {
      name: "check_batch",
      description:
        "Check up to 100 names in one call. Returns per-query CheckSummary results plus a markdown overview. Useful when an agent needs to evaluate many candidate names at once. Duplicate queries within the batch share an in-memory cache.",
      inputSchema: {
        type: "object",
        properties: {
          queries: {
            type: "array",
            items: { type: "string" },
            description: "1..100 names to check.",
          },
          categories: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "trademark",
                "domain",
                "social",
                "appstore",
                "package",
                "code",
              ],
            },
            description: "Limit to these provider categories.",
          },
          providers: {
            type: "array",
            items: { type: "string" },
            description: "Explicit provider id allowlist.",
          },
          excludeProviders: {
            type: "array",
            items: { type: "string" },
            description: "Provider ids to skip.",
          },
          timeoutMs: { type: "number", description: "Per-provider timeout (default 12000)." },
          concurrency: { type: "number", description: "Per-query provider concurrency (default 8)." },
          batchConcurrency: { type: "number", description: "How many queries to run in parallel (default 4)." },
        },
        required: ["queries"],
      },
    },
    {
      name: "find_free_names",
      description:
        "Brainstorming primitive: given candidate names, return only those that are 'available' on every required provider (and/or every required category). Default required providers are domain-com, npm, github-user, bluesky. Pair with an LLM that generates 50-100 candidates; this tool returns the survivors.",
      inputSchema: {
        type: "object",
        properties: {
          queries: {
            type: "array",
            items: { type: "string" },
            description: "Candidate names. 1..100.",
          },
          requireAvailableProviders: {
            type: "array",
            items: { type: "string" },
            description:
              "Provider ids that must return status=available. Default: [domain-com, npm, github-user, bluesky].",
          },
          requireAvailableCategories: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "trademark",
                "domain",
                "social",
                "appstore",
                "package",
                "code",
              ],
            },
            description:
              "Categories where every provider in the category must return status=available.",
          },
          timeoutMs: { type: "number", description: "Per-provider timeout (default 12000)." },
          concurrency: { type: "number", description: "Per-query provider concurrency (default 8)." },
          batchConcurrency: { type: "number", description: "Queries-in-flight (default 4)." },
        },
        required: ["queries"],
      },
    },
    {
      name: "list_providers",
      description: "List all available name-check providers with their ids, names, and categories.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "list_providers") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            allProviders.map((p) => ({
              id: p.id,
              name: p.name,
              category: p.category,
              description: p.description,
            })),
            null,
            2,
          ),
        },
      ],
    };
  }

  if (req.params.name === "check_name") {
    const parsed = checkRequestSchema.safeParse(req.params.arguments ?? {});
    if (!parsed.success) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Invalid arguments: ${parsed.error.message}`,
          },
        ],
      };
    }
    const summary = await runCheck(parsed.data);
    const markdown = renderMarkdown(summary.results, summary);
    const resourceLinks = buildResourceLinks(summary.results);
    return {
      content: [
        { type: "text", text: markdown },
        ...resourceLinks,
        { type: "text", text: JSON.stringify(summary, null, 2) },
      ],
    };
  }

  if (req.params.name === "check_batch") {
    const parsed = batchCheckRequestSchema.safeParse(req.params.arguments ?? {});
    if (!parsed.success) {
      return {
        isError: true,
        content: [
          { type: "text", text: `Invalid arguments: ${parsed.error.message}` },
        ],
      };
    }
    const batch = await runCheckBatch(parsed.data);
    const markdown = renderBatchMarkdown(batch.queries, batch.results, batch.totalMs);
    return {
      content: [
        { type: "text", text: markdown },
        { type: "text", text: JSON.stringify(batch, null, 2) },
      ],
    };
  }

  if (req.params.name === "find_free_names") {
    const parsed = findFreeNamesRequestSchema.safeParse(req.params.arguments ?? {});
    if (!parsed.success) {
      return {
        isError: true,
        content: [
          { type: "text", text: `Invalid arguments: ${parsed.error.message}` },
        ],
      };
    }
    const args = parsed.data;
    const requiredProviders =
      args.requireAvailableProviders && args.requireAvailableProviders.length > 0
        ? args.requireAvailableProviders
        : args.requireAvailableCategories && args.requireAvailableCategories.length > 0
          ? []
          : DEFAULT_REQUIRED_PROVIDERS;
    const requiredCategories: ProviderCategory[] = args.requireAvailableCategories ?? [];

    const knownProviderIds = new Set(allProviders.map((p) => p.id));
    const unknownRequired = requiredProviders.filter(
      (id) => !knownProviderIds.has(id),
    );
    if (unknownRequired.length > 0) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Unknown provider ids: ${unknownRequired.join(", ")}. Use list_providers to see valid ids.`,
          },
        ],
      };
    }

    const categoryIds = new Set(
      allProviders
        .filter((p) => requiredCategories.includes(p.category))
        .map((p) => p.id),
    );
    const runProviderIds = Array.from(
      new Set([...requiredProviders, ...categoryIds]),
    );

    const batch = await runCheckBatch({
      queries: args.queries,
      providers: runProviderIds,
      timeoutMs: args.timeoutMs,
      concurrency: args.concurrency,
      batchConcurrency: args.batchConcurrency,
    });

    const freeNames = batch.results
      .filter((s) =>
        isFreeEverywhere(s, requiredProviders, requiredCategories),
      )
      .map((s) => s.query);

    const result: FreeAnywhereResult = {
      freeNames,
      requiredProviders,
      requiredCategories,
      allResults: batch.results,
      totalMs: batch.totalMs,
    };
    const markdown = renderFreeNamesMarkdown(
      batch.queries,
      batch.results,
      freeNames,
      requiredProviders,
      requiredCategories,
      batch.totalMs,
    );
    return {
      content: [
        { type: "text", text: markdown },
        { type: "text", text: JSON.stringify(result, null, 2) },
      ],
    };
  }

  return {
    isError: true,
    content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
  };
});

function isFreeEverywhere(
  summary: CheckSummary,
  requiredProviders: string[],
  requiredCategories: ProviderCategory[],
): boolean {
  const byId = new Map(summary.results.map((r) => [r.providerId, r]));
  for (const pid of requiredProviders) {
    const r = byId.get(pid);
    if (!r || r.status !== "available") return false;
  }
  if (requiredCategories.length > 0) {
    for (const cat of requiredCategories) {
      const inCat = summary.results.filter((r) => r.category === cat);
      if (inCat.length === 0) return false;
      if (!inCat.every((r) => r.status === "available")) return false;
    }
  }
  return true;
}

function renderBatchMarkdown(
  queries: string[],
  results: CheckSummary[],
  totalMs: number,
): string {
  const lines: string[] = [];
  lines.push(`# check_batch (${queries.length} queries · ${totalMs}ms)`);
  lines.push("");
  lines.push("| query | verdict | avail | taken | partial | check | unkn | err | ms |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const s of results) {
    const r = s.rollup;
    lines.push(
      `| \`${s.query}\` | ${s.verdict} | ${r.available} | ${r.taken} | ${r.partial} | ${r.manual_verify} | ${r.unknown} | ${r.error} | ${s.totalMs} |`,
    );
  }
  return lines.join("\n");
}

function renderFreeNamesMarkdown(
  queries: string[],
  results: CheckSummary[],
  freeNames: string[],
  requiredProviders: string[],
  requiredCategories: ProviderCategory[],
  totalMs: number,
): string {
  const lines: string[] = [];
  lines.push(
    `# find_free_names (${freeNames.length}/${queries.length} survived · ${totalMs}ms)`,
  );
  lines.push("");
  lines.push(
    `Required providers: ${requiredProviders.length > 0 ? requiredProviders.map((p) => `\`${p}\``).join(", ") : "(none)"}`,
  );
  lines.push(
    `Required categories: ${requiredCategories.length > 0 ? requiredCategories.join(", ") : "(none)"}`,
  );
  lines.push("");
  lines.push("## Free names");
  if (freeNames.length === 0) {
    lines.push("_None of the candidates are free on every required provider._");
  } else {
    for (const n of freeNames) lines.push(`- ✅ \`${n}\``);
  }
  lines.push("");
  lines.push("## Per-candidate detail");
  for (const s of results) {
    const free = freeNames.includes(s.query);
    lines.push(`### ${free ? "✅" : "❌"} \`${s.query}\``);
    for (const pid of requiredProviders) {
      const r = s.results.find((x) => x.providerId === pid);
      lines.push(`- \`${pid}\`: ${r ? r.status : "missing"}${r?.detail ? ` — ${r.detail}` : ""}`);
    }
    for (const cat of requiredCategories) {
      const inCat = s.results.filter((x) => x.category === cat);
      const ok = inCat.every((x) => x.status === "available");
      lines.push(
        `- category \`${cat}\`: ${ok ? "all available" : "not all available"} (${inCat.length} providers)`,
      );
    }
  }
  return lines.join("\n");
}

type ResourceLinkBlock = {
  type: "resource_link";
  uri: string;
  name?: string;
  description?: string;
};

const RESOURCE_LINK_CAP = 20;

function buildResourceLinks(results: ProviderResult[]): ResourceLinkBlock[] {
  const linkable = results.filter(
    (r): r is ProviderResult & { verifyUrl: string } =>
      typeof r.verifyUrl === "string" && r.verifyUrl.length > 0,
  );
  const taken = linkable.filter((r) => r.status === "taken");
  const partial = linkable.filter((r) => r.status === "partial");
  const trademark = linkable.filter(
    (r) => r.category === "trademark" && r.status !== "taken" && r.status !== "partial",
  );
  const domain = linkable.filter(
    (r) => r.category === "domain" && r.status !== "taken" && r.status !== "partial",
  );
  const ordered = [...taken, ...partial, ...trademark, ...domain];
  const seen = new Set<string>();
  const out: ResourceLinkBlock[] = [];
  for (const r of ordered) {
    if (out.length >= RESOURCE_LINK_CAP) break;
    if (seen.has(r.verifyUrl)) continue;
    seen.add(r.verifyUrl);
    out.push({
      type: "resource_link",
      uri: r.verifyUrl,
      name: `${r.providerName} — ${r.status}`,
      description: r.detail ?? r.error,
    });
  }
  return out;
}

function renderMarkdown(results: ProviderResult[], summary: CheckSummary): string {
  const lines: string[] = [];
  lines.push(`# name-check: ${summary.query}`);
  lines.push(
    `**Verdict:** ${summary.verdict} · **Score:** ${summary.score}/100 · ${summary.totalMs}ms · ${results.length} providers`,
  );
  const r = summary.rollup;
  lines.push(
    `avail:${r.available ?? 0} · taken:${r.taken ?? 0} · part:${r.partial ?? 0} · check:${r.manual_verify ?? 0} · unkn:${r.unknown ?? 0} · err:${r.error ?? 0}`,
  );
  if (summary.subverdicts) {
    const cats: Array<keyof typeof summary.subverdicts> = [
      "trademark",
      "domain",
      "social",
      "appstore",
      "package",
      "code",
    ];
    lines.push(
      cats.map((c) => `${c}:${summary.subverdicts[c]}`).join(" · "),
    );
  }
  if (summary.scoreBreakdown && summary.scoreBreakdown.length > 0) {
    const top = summary.scoreBreakdown
      .slice()
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 6);
    lines.push("");
    lines.push(`**Why:** ${top.map((e) => `${e.delta > 0 ? "+" : ""}${e.delta} ${e.reason}`).join("; ")}`);
  }
  const byCat = new Map<string, ProviderResult[]>();
  for (const x of results) {
    const arr = byCat.get(x.category) ?? [];
    arr.push(x);
    byCat.set(x.category, arr);
  }
  for (const [cat, items] of byCat) {
    lines.push(`\n## ${cat.toUpperCase()}`);
    for (const it of items) {
      const url = it.verifyUrl ? ` — [verify](${it.verifyUrl})` : "";
      lines.push(`- **${it.status.toUpperCase()}** \`${it.providerId}\` ${it.providerName}: ${it.detail ?? it.error ?? ""}${url}`);
    }
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
