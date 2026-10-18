import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.E2E_PORT ?? 51847);
const API_PORT = Number(process.env.E2E_API_PORT ?? PORT + 1);
const BASE_URL = `http://127.0.0.1:${PORT}`;
// A throwaway account database for the API server under test.
const AUTH_DB_PATH = join(tmpdir(), `name-checker-e2e-${API_PORT}`, "auth.db");
// `export` (default): the production artifact, `out/` served the way the
// Worker serves it (packages/client/scripts/serve-export.mjs).
// `dev`: `next dev` with its /api proxy, faster while editing pages.
const MODE = process.env.E2E_MODE === "dev" ? "dev" : "export";
const clientCommand =
  MODE === "dev"
    ? `pnpm --filter @starter/client exec next dev -p ${PORT}`
    : `pnpm run build:client && node packages/client/scripts/serve-export.mjs`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Same shape as production: the browser talks to one origin; the Next
  // dev server proxies /api/* to the API server (packages/server).
  webServer: [
    {
      command: `pnpm run build:shared && pnpm --filter @starter/server exec tsx src/index.ts`,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: {
        PORT: String(API_PORT),
        HOSTNAME: "127.0.0.1",
        AUTH_DB_PATH,
        BETTER_AUTH_URL: BASE_URL,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: clientCommand,
      url: BASE_URL,
      env: { PORT: String(PORT), API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
