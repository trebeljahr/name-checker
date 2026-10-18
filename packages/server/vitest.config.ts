import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", maxWorkers: 1, include: ["src/tests/**/*.test.ts"] },
});
