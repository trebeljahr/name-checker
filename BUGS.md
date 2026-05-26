# Known bugs

## CLI dist crashes at runtime: `@starter/shared` resolves to TS source, not built dist

**Discovered:** 2026-05-18 while running `node packages/cli/dist/index.js --list`.

**Symptom:**

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'/Users/rico/projects/name-checker/packages/shared/src/types.js'
imported from /Users/rico/projects/name-checker/packages/shared/src/index.ts
```

**Root cause:** `packages/shared/package.json` declares:

```json
"main": "./src/index.ts",
"exports": {
  ".":   { "types": "./src/index.ts", "default": "./src/index.ts" },
  "./*": { "types": "./src/*.ts",     "default": "./src/*.ts" }
}
```

When the CLI is run from `dist/`, Node resolves the `@starter/shared` import to
`packages/shared/src/index.ts`. That file does `export * from "./types.js";`
which Node tries to resolve literally as `src/types.js` (a file that does not
exist — the built file is at `dist/types.js`).

`pnpm run build:shared` produces `packages/shared/dist/` correctly. The
package.json simply does not point at it.

**Fix options:**

1. Change `main`/`exports` to point at `dist/index.js` (requires building shared
   before any CLI/MCP work — but that's already the documented step in README).
2. Keep dual exports: production builds to `dist/`, dev/typecheck still resolves
   from `src/` via a `development` condition.

**Workaround until fixed:** run the CLI via `tsx packages/cli/src/index.ts …`
instead of the built `dist/index.js`. The MCP server likely has the same issue.

**Impact:** ships-but-doesn't-run for any consumer who follows the README's
build-then-`node dist/` path. `pnpm link --global` from `packages/cli` will also
crash on first invocation.

---

## TMview provider always fails: `fetch failed` for every query

**Discovered:** 2026-05-18 while running batch trademark checks across ~20
candidate names. Every single TMview probe returned the same result:

```
tmview: manual_verify — TMview unreachable (fetch failed); verify manually.
```

**Why this matters:** TMview is documented in the README as the **only**
auto-checked trademark source. Every other TM provider (USPTO, EUIPO, DPMA,
WIPO, UKIPO, CIPO, IP Australia) is verify-link only. With TMview broken, the
tool effectively has **zero** working live trademark checks — it falls back to
"click these eight links yourself."

USPTO and EUIPO providers worked fine in the same runs (returned `available`
with real elasticsearch / eSearch hits), so the failure is specific to TMview.

**Likely causes (need investigation):**

1. TMview API endpoint changed (URL / auth / payload format).
2. Cloudflare / WAF rule now blocks anonymous fetches.
3. TLS or DNS issue specific to the TMview host.

**Repro:**

```bash
npx tsx packages/cli/src/index.ts relayhouse --provider tmview --json
```

**Suggested next step:** capture the actual request (curl with verbose logging
against the same URL the provider builds) and compare against the TMview API
docs / network tab on tmdn.org. Until fixed, every TMview row in CLI/MCP/web
output is noise — consider hiding TMview from the default provider list and
surfacing a `WARN: TMview disabled` banner instead, so users don't get a false
sense that automated TM checking is happening.
