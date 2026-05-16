# name-check

One search across trademarks, domains, socials, app stores, package registries, and code hosts. Tells you whether a name is **available**, **taken**, or **needs manual verify**.

Shared TypeScript core powers three surfaces:

- **CLI** — `name-check kairos` in your terminal.
- **MCP server** — `name-check-mcp` over stdio for Claude / Cursor.
- **Web UI** — Next.js `/check` page with streaming results.

## Layout

```
packages/
  shared/    provider interface, orchestrator, ~56 providers
  cli/       bin: name-check
  mcp/       bin: name-check-mcp  (stdio)
  client/    Next.js: /check page + /api/check route
```

## Providers (56 total)

### Trademarks (8)
- **TMview** — live joint EUIPO/WIPO/national API across 70+ offices. The only auto-checked trademark source; returns `taken` on exact-name match, `partial` on similar.
- Verify-link (deep-linked search URL, status `manual_verify`): USPTO, EUIPO eSearch, DPMA (DE), WIPO Global Brand DB, UKIPO, CIPO (CA), IP Australia. Click through to confirm — focus on Nice classes 9 (downloadable software) + 41 (entertainment services) for games.

### Domains (18)
RDAP via `rdap.org` (returns `available` on 404, `taken` on 200):

```
.com .net .org .io .dev .app .ai .co .xyz .me
.gg .game .games .studio .tech .fun .lol .gaming
```

Each row links to a Namecheap registration page for one-click purchase.

### Social handles (19)
- Real API: Bluesky (resolveHandle), GitHub user/org (`/users/:name`), Reddit user, Reddit subreddit, Mastodon (mastodon.social + mastodon.gamedev.place).
- HEAD probe: YouTube `@handle`, itch.io subdomain, Patreon, Ko-fi, Substack subdomain, Pinterest.
- Unreliable (returns `manual_verify` even on 200 because anti-bot/auth walls lie): X/Twitter, TikTok, Twitch, Instagram, Threads, Steam community, LinkedIn company.

### App stores (5)
- Apple App Store (iTunes Search API — real)
- Google Play, Microsoft Store, Steam store, itch.io games (verify-link)

### Package registries (5)
npm, PyPI, crates.io, RubyGems, Maven Central — all live API.

### Code (1)
GitHub repo search.

## Status values

| Status         | Meaning |
|----------------|---------|
| `available`    | Confirmed free. |
| `taken`        | Confirmed registered. |
| `partial`      | Similar matches exist, no exact match — review for confusion risk. |
| `manual_verify`| Source has no reliable API; click the verify link. |
| `unknown`      | Couldn't determine (rate-limit, RDAP gap, etc.). |
| `error`        | Provider crashed. |

Verdict rollup: `likely_available` if any `available` and zero `taken`/`partial`; `likely_taken` if any `taken`/`partial`; otherwise `mixed`.

## Run

```bash
pnpm install
pnpm run build:shared            # compile @starter/shared (others depend on its dist/)
```

### CLI

```bash
pnpm run build:cli
node packages/cli/dist/index.js kairosprotocol
# or after `pnpm link --global` in packages/cli:
name-check kairosprotocol
name-check outpostkairos --category trademark,domain
name-check kairos --provider tmview,domain-com,bluesky,npm --json
name-check kairos --exclude x,instagram,tiktok
name-check --list
```

Exit code: `0` if verdict isn't `likely_taken`, `1` if it is.

### MCP server

```bash
pnpm run build:mcp
node packages/mcp/dist/index.js     # speaks MCP over stdio
```

Register in Claude / Cursor config:

```json
{
  "mcpServers": {
    "name-check": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/index.js"]
    }
  }
}
```

Tools:
- `check_name(query, categories?, providers?, excludeProviders?, timeoutMs?, concurrency?)`
- `list_providers()`

### Web UI

```bash
pnpm run dev          # Next.js dev on :3742
```

- `/` — landing.
- `/check` — search form + streaming results.
- `POST /api/check` — `{ query, categories?, providers?, excludeProviders? }` → `CheckSummary` JSON.
- `POST /api/check?stream=1` — same input, Server-Sent Events: `result` per provider, `done` with the full summary.
- `GET /api/check` — list all providers.

## Add a provider

1. Create a `Provider` object in `packages/shared/src/providers/<category>.ts`:
   ```ts
   const myProvider: Provider = {
     id: "my-source",
     name: "Display name",
     category: "social",
     async check(query, signal) {
       const res = await fetchWithTimeout(`https://…/${query}`, { signal });
       if (res.status === 200) return { status: "taken", verifyUrl: `https://…/${query}` };
       if (res.status === 404) return { status: "available", verifyUrl: `https://…/${query}` };
       return { status: "manual_verify", verifyUrl: `https://…/${query}` };
     },
   };
   ```
2. Add to the file's exported array.
3. `pnpm run build:shared`.

That's it — CLI, MCP, and web UI pick it up via `allProviders`.

## Honesty about reliability

- **Trademarks**: only TMview is auto-checked. Treat every "verify" row as required reading before you commit to a name — trademarks are jurisdiction-specific and class-specific, and a human still needs to read the actual mark records.
- **Anti-bot platforms (X, TikTok, Twitch, IG, Threads, Steam, LinkedIn)** return inconsistent responses to anonymous requests. They're reported as `manual_verify` even when the probe gets a 200, so you don't get a false confident answer.
- **RDAP** is the authoritative source for most ICANN gTLDs, but some TLDs respond with 403/429 to anonymous queries (`.fun`, `.lol`, `.gaming`, `.tech` are flaky). The row falls back to `unknown` / `manual_verify` with the registration link.
