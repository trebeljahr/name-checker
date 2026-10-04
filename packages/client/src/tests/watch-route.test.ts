import { afterEach, expect, it, vi } from "vitest";
import { GET } from "../app/api/cron/watch/route";
const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  reserve: vi.fn(),
  batch: vi.fn(),
  held: vi.fn(),
}));
vi.mock("../lib/db", () => ({ getDb: mocks.getDb }));
vi.mock("../lib/watch-jobs", () => ({
  createWatchJobStore: () => ({
    reserveDue: mocks.reserve,
    heldCount: mocks.held,
  }),
}));
vi.mock("../lib/watch-job-worker", () => ({ runWatchBatch: mocks.batch }));
vi.mock("../lib/mailer", () => ({ sendMail: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function request(authorized = true): Request {
  return new Request("http://localhost/api/cron/watch", {
    headers: authorized ? { authorization: "Bearer fixture-cron" } : {},
  });
}
it("refuses absent authorization and drain before opening the database", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect((await GET(request())).status).toBe(503);
  vi.stubEnv("CRON_SECRET", "fixture-cron");
  expect((await GET(request(false))).status).toBe(401);
  vi.stubEnv("HATCHKIT_DRAINING", "1");
  expect((await GET(request())).status).toBe(503);
  expect(mocks.getDb).not.toHaveBeenCalled();
  expect(mocks.reserve).not.toHaveBeenCalled();
});
it("captures authorized work before processing a bounded batch and exposes safe holds", async () => {
  vi.stubEnv("CRON_SECRET", "fixture-cron");
  vi.stubEnv("HATCHKIT_DRAINING", "");
  mocks.reserve.mockReturnValue(12);
  mocks.held.mockReturnValue(1);
  mocks.batch.mockImplementation(async () => {
    expect(mocks.reserve).toHaveBeenCalledWith(23 * 60 * 60 * 1000);
    return [
      {
        id: "fixture",
        state: "uncertain",
        changed: 1,
        reason: "delivery_outcome_unknown",
      },
    ];
  });
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    ok: true,
    scheduled: 12,
    processed: 1,
    heldDeliveries: 1,
    report: [
      {
        id: "fixture",
        state: "uncertain",
        changed: 1,
        reason: "delivery_outcome_unknown",
      },
    ],
  });
});
