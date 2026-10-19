import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import path from "node:path";

// Production is a static export (`out/`) that a Cloudflare Worker serves;
// every `/api/*` request on the same host goes to the API server
// (packages/server) instead. `next dev` is not an export: it serves the
// pages and proxies `/api/*` to the dev API server.
export default function nextConfig(phase: string): NextConfig {
  const dev = phase === PHASE_DEVELOPMENT_SERVER;
  // Next loads the committed, dotenvx-encrypted .env.production into the
  // build. It holds the server's configuration; a NEXT_PUBLIC_ value from
  // it would be ciphertext inlined into public pages. Treat those as unset.
  // CI passes the real public values as environment variables.
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("NEXT_PUBLIC_") && value?.startsWith("encrypted:")) {
      delete process.env[key];
    }
  }
  return {
    output: dev ? undefined : "export",
    // The export writes `x/index.html`; Cloudflare serves it at `/x/` and
    // redirects `/x` there. Off in dev, where Next would otherwise redirect
    // `/api/x` to `/api/x/` before the proxy below sees it.
    trailingSlash: !dev,
    images: { unoptimized: true },
    // Error reporting is opt-in per build. An empty fallback makes the
    // condition in front of the SDK import (lib/error-reporting/reporter.ts)
    // a literal, so a build without a DSN folds the import away and ships
    // none of the SDK. CI passes the value from the repo variable.
    env: {
      NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
    },
    transpilePackages: ["@starter/shared"],
    webpack(config) {
      // Shared ESM source uses .js specifiers for its TypeScript modules.
      config.resolve.extensionAlias = {
        ...config.resolve.extensionAlias,
        ".js": [".ts", ".tsx", ".js"],
      };
      return config;
    },
    // Worktrees have their own lockfile sibling to the root one; pin
    // Turbopack's workspace root to silence the inferred-root warning.
    turbopack: {
      root: path.resolve(__dirname, "../.."),
    },
    ...(dev
      ? {
          async rewrites() {
            const api = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:5818";
            return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
          },
        }
      : {}),
  };
}
