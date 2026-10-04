import { afterEach, expect, it, vi } from "vitest";
import { register } from "../instrumentation";
const mocks = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("../lib/watch-job-runtime", () => ({
  startWatchRecovery: mocks.start,
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it.each([
  { runtime: "edge", phase: "", mode: "production" },
  { runtime: "nodejs", phase: "phase-production-build", mode: "production" },
  { runtime: "nodejs", phase: "", mode: "test" },
  { runtime: "nodejs", phase: "", mode: "development" },
])(
  "does not start workers during $runtime / $phase / $mode",
  async ({ runtime, phase, mode }) => {
    vi.stubEnv("NEXT_RUNTIME", runtime);
    vi.stubEnv("NEXT_PHASE", phase);
    vi.stubEnv("NODE_ENV", mode);
    await register();
    expect(mocks.start).not.toHaveBeenCalled();
  },
);
it("production Node startup starts existing-receipt recovery", async () => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("NEXT_PHASE", "");
  vi.stubEnv("NODE_ENV", "production");
  await register();
  expect(mocks.start).toHaveBeenCalledOnce();
});
