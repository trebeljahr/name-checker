import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  transpilePackages: ["@starter/shared"],
  // Worktrees have their own lockfile sibling to the root one; pin
  // Turbopack's workspace root to silence the inferred-root warning.
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
