import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
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
};

export default nextConfig;
