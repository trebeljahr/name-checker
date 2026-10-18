import { afterEach, expect, it, vi } from "vitest";
import { startBackgroundWorkers } from "../workers";
const mocks = vi.hoisted(() => ({ start: vi.fn(() => ({ stop: async () => {} })) }));
vi.mock("../lib/watch-job-runtime", () => ({
  startWatchRecovery: mocks.start,
}));
afterEach(() => {
  vi.clearAllMocks();
});
it.each(["test", "development", undefined])(
  "does not start workers when NODE_ENV is %s",
  (mode) => {
    expect(startBackgroundWorkers({ NODE_ENV: mode })).toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();
  },
);
it("production startup starts existing-receipt recovery", () => {
  expect(startBackgroundWorkers({ NODE_ENV: "production" })).not.toBeNull();
  expect(mocks.start).toHaveBeenCalledOnce();
});
