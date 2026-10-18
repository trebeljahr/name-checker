import { afterEach, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createWatchJobStore, type WatchJobStore } from "../lib/watch-jobs";
import { startWatchRecovery } from "../lib/watch-job-runtime";
import { MailDeliveryError } from "../lib/mail-delivery";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), send: vi.fn() }));
vi.mock("../lib/db", () => ({ getDb: mocks.getDb }));
vi.mock("../lib/mailer", () => ({ sendMail: mocks.send }));
let db: Database.Database | undefined;
const runtime = globalThis as typeof globalThis & {
  __watchRecovery?: { stop: () => Promise<void> };
};
afterEach(async () => {
  await runtime.__watchRecovery?.stop();
  delete runtime.__watchRecovery;
  db?.close();
  db = undefined;
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function fixture(): WatchJobStore {
  db = new Database(":memory:");
  db.pragma("foreign_keys=ON");
  db.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,email TEXT); INSERT INTO user VALUES ('owner','synthetic@example.test');
    CREATE TABLE watches(id TEXT PRIMARY KEY,user_id TEXT REFERENCES user(id) ON DELETE CASCADE,query TEXT,categories_csv TEXT,providers_csv TEXT,created_at INTEGER,last_run_at INTEGER,last_summary_json TEXT);
    INSERT INTO watches VALUES ('watch','owner','synthetic',NULL,NULL,1,1,NULL);`);
  mocks.getDb.mockReturnValue(db);
  return createWatchJobStore(db);
}
function pending(store: WatchJobStore): string {
  store.reserveDue(1);
  const run = store.runnable()[0]!;
  // Model the persisted atomic notification checkpoint, without external checks.
  db!
    .prepare("UPDATE watch_runs SET phase='pending',message_json=? WHERE id=?")
    .run(JSON.stringify({ subject: "Synthetic", text: "Fixture" }), run.id);
  return run.id;
}
it("startup resumes retained notifications but never schedules uncaptured watches", async () => {
  const store = fixture();
  mocks.send.mockResolvedValue(undefined);
  const recovery = startWatchRecovery();
  expect(startWatchRecovery()).toBe(recovery);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(store.runnable()).toEqual([]);
  expect(mocks.send).not.toHaveBeenCalled();
  expect(db!.prepare("SELECT last_run_at FROM watches").get()).toEqual({
    last_run_at: 1,
  });
  await recovery.stop();
  delete runtime.__watchRecovery;
  const id = pending(store);
  startWatchRecovery();
  await vi.waitFor(() => expect(store.inspect(id)?.phase).toBe("sent"));
  expect(mocks.send).toHaveBeenCalledOnce();
});
it("drain stops runtime ownership and holds an interrupted external send", async () => {
  const store = fixture(),
    id = pending(store);
  mocks.send.mockImplementation(
    (_message, { signal }: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () =>
            reject(
              new MailDeliveryError(
                "unknown",
                "Synthetic interrupted delivery",
              ),
            ),
          { once: true },
        );
      }),
  );
  const recovery = startWatchRecovery();
  await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
  vi.stubEnv("HATCHKIT_DRAINING", "1");
  await vi.waitFor(() => expect(store.inspect(id)?.phase).toBe("uncertain"));
  await recovery.stop();
  expect(store.inspect(id)?.worker).toBeNull();
  expect(store.claim(id)).toBeNull();
  expect(store.runnable()).toEqual([]);
  expect(mocks.send).toHaveBeenCalledOnce();
});
