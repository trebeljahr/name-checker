#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  allProviders,
  checkRequestSchema,
  runCheck,
  type ProviderResult,
} from "@starter/shared";

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
    return {
      content: [
        { type: "text", text: markdown },
        { type: "text", text: JSON.stringify(summary, null, 2) },
      ],
    };
  }

  return {
    isError: true,
    content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
  };
});

function renderMarkdown(
  results: ProviderResult[],
  summary: { query: string; verdict: string; rollup: Record<string, number>; totalMs: number },
): string {
  const lines: string[] = [];
  lines.push(`# name-check: ${summary.query}`);
  lines.push(`**Verdict:** ${summary.verdict} · ${summary.totalMs}ms · ${results.length} providers`);
  const r = summary.rollup;
  lines.push(
    `avail:${r.available ?? 0} · taken:${r.taken ?? 0} · part:${r.partial ?? 0} · check:${r.manual_verify ?? 0} · unkn:${r.unknown ?? 0} · err:${r.error ?? 0}`,
  );
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
