import { afterEach, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createWatchJobStore, WATCH_LEASE_MS } from "../lib/watch-jobs";
import { runWatchJob } from "../lib/watch-job-worker";
import { MailDeliveryError } from "../lib/mail-delivery";
import {
  runCheckWithProviders,
  type Provider,
  type CheckStatus,
} from "@starter/shared";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) close();
  vi.restoreAllMocks();
});
const provider = (id: string, status: CheckStatus): Provider => ({
  id,
  name: id,
  category: "package",
  check: async () => ({ status }),
});
async function fixture() {
  const path = mkdtempSync(join(tmpdir(), "watch-jobs-"));
  const a = new Database(join(path, "auth.db"));
  a.pragma("journal_mode=WAL");
  a.pragma("foreign_keys=ON");
  a.exec(`CREATE TABLE user(id TEXT PRIMARY KEY,email TEXT); INSERT INTO user VALUES ('owner','fixture@example.test');
    CREATE TABLE watches(id TEXT PRIMARY KEY,user_id TEXT REFERENCES user(id) ON DELETE CASCADE,query TEXT,categories_csv TEXT,providers_csv TEXT,created_at INTEGER,last_run_at INTEGER,last_summary_json TEXT);`);
  const b = new Database(join(path, "auth.db"));
  b.pragma("foreign_keys=ON");
  cleanup.push(() => {
    a.close();
    b.close();
    rmSync(path, { recursive: true, force: true });
  });
  const prior = await runCheckWithProviders([provider("fixture", "taken")], {
    query: "synthetic-private-query",
  });
  a.prepare(
    "INSERT INTO watches VALUES ('watch','owner',?,NULL,NULL,1,1,?)",
  ).run(prior.query, JSON.stringify(prior));
  let now = 100_000;
  const first = createWatchJobStore(a, () => now),
    second = createWatchJobStore(b, () => now);
  return {
    a,
    b,
    first,
    second,
    prior,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
const signal = (): AbortSignal => new AbortController().signal;

it("deduplicates overlapping cron captures and fences old writers across WAL connections", async () => {
  const f = await fixture();
  expect(f.first.reserveDue(1000)).toBe(1);
  expect(f.second.reserveDue(1000)).toBe(0);
  const run = f.first.runnable()[0]!;
  const old = f.first.claim(run.id)!;
  expect(f.second.claim(run.id)).toBeNull();
  f.advance(WATCH_LEASE_MS + 1);
  const next = f.second.claim(run.id)!;
  expect(next).not.toBe(old);
  expect(() => f.first.prepare(run.id, old, f.prior, null, 0)).toThrow(
    "watch_lease_lost",
  );
  expect(() => f.first.saveResult(run.id, old, f.prior.results[0]!)).toThrow(
    "watch_lease_lost",
  );
  f.second.prepare(run.id, next, f.prior, null, 0);
  expect(f.second.inspect(run.id)?.phase).toBe("no_change");
});

it("checkpointed providers survive drain and completed work is not repeated", async () => {
  const f = await fixture();
  f.first.reserveDue(1000);
  const run = f.first.runnable()[0]!;
  const slow = vi.fn(() => new Promise<never>(() => {}));
  const fast = vi.fn(async () => ({ status: "available" as const }));
  const controller = new AbortController();
  const active = runWatchJob(f.first, run, controller.signal, vi.fn(), {
    catalog: [
      { ...provider("fixture", "available"), check: fast },
      { ...provider("slow", "available"), check: slow },
    ],
  });
  await vi.waitFor(() =>
    expect(
      f.a.prepare("SELECT count(*) n FROM watch_run_results").get(),
    ).toEqual({ n: 1 }),
  );
  controller.abort();
  await active;
  expect(f.first.inspect(run.id)?.phase).toBe("checking");
  const send = vi.fn().mockResolvedValue(undefined);
  await runWatchJob(f.second, f.second.runnable()[0]!, signal(), send, {
    catalog: [
      { ...provider("fixture", "available"), check: fast },
      provider("slow", "available"),
    ],
  });
  expect(fast).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledTimes(1);
  expect(f.second.inspect(run.id)?.phase).toBe("sent");
});

it("summary and notification intent commit together; restart sends the stored diff", async () => {
  const f = await fixture();
  f.first.reserveDue(1000);
  const run = f.first.runnable()[0]!,
    owner = f.first.claim(run.id)!;
  const next = await runCheckWithProviders([provider("fixture", "available")], {
    query: f.prior.query,
  });
  f.first.prepare(
    run.id,
    owner,
    next,
    { subject: "Synthetic diff", text: "Synthetic body" },
    1,
  );
  expect(
    JSON.parse(
      (
        f.a.prepare("SELECT last_summary_json AS data FROM watches").get() as {
          data: string;
        }
      ).data,
    ).results[0].status,
  ).toBe("available");
  f.advance(WATCH_LEASE_MS + 1);
  const check = vi.fn(async () => ({ status: "available" as const }));
  const send = vi.fn().mockResolvedValue(undefined);
  await runWatchJob(f.second, f.second.runnable()[0]!, signal(), send, {
    catalog: [{ ...provider("fixture", "available"), check }],
  });
  expect(check).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledWith(
    {
      to: "fixture@example.test",
      subject: "Synthetic diff",
      text: "Synthetic body",
    },
    expect.anything(),
  );
});

it("dead or ambiguous senders are held and never automatically retried", async () => {
  const f = await fixture();
  f.first.reserveDue(1000);
  const run = f.first.runnable()[0]!;
  const send = vi
    .fn()
    .mockRejectedValue(new Error("Private provider response and email body"));
  const log = vi.spyOn(console, "log"),
    error = vi.spyOn(console, "error");
  await runWatchJob(f.first, run, signal(), send, {
    catalog: [provider("fixture", "available")],
  });
  expect(f.first.inspect(run.id)?.phase).toBe("uncertain");
  expect(f.second.runnable()).toEqual([]);
  expect(f.second.heldCount()).toBe(1);
  expect(log).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledTimes(1);
});

it("crash after send intent expires to uncertain, even without a recorded error", async () => {
  const f = await fixture();
  f.first.reserveDue(1000);
  const run = f.first.runnable()[0]!,
    owner = f.first.claim(run.id)!;
  f.first.prepare(
    run.id,
    owner,
    f.prior,
    { subject: "Fixture", text: "Fixture" },
    1,
  );
  expect(f.first.beginDelivery(run.id, owner)?.to).toBe("fixture@example.test");
  f.first.release(run.id, owner);
  expect(f.first.inspect(run.id)?.phase).toBe("sending");
  f.advance(WATCH_LEASE_MS + 1);
  expect(f.second.claim(run.id)).toBeNull();
  expect(f.second.runnable()).toEqual([]);
  expect(f.first.inspect(run.id)?.phase).toBe("uncertain");
  expect(() => f.first.delivery(run.id, owner, "sent")).toThrow(
    "watch_lease_lost",
  );
  expect(() => f.first.delivery(run.id, owner, "not_sent")).toThrow(
    "watch_lease_lost",
  );
});

it("known preflight failures remain pending; missing recipient never starts delivery", async () => {
  const f = await fixture();
  f.first.reserveDue(1000);
  const run = f.first.runnable()[0]!;
  const send = vi
    .fn()
    .mockRejectedValue(
      new MailDeliveryError("not_sent", "No configured sender"),
    );
  await runWatchJob(f.first, run, signal(), send, {
    catalog: [provider("fixture", "available")],
  });
  expect(f.first.inspect(run.id)?.phase).toBe("pending");
  f.a.prepare("UPDATE user SET email=NULL").run();
  await runWatchJob(f.second, f.second.runnable()[0]!, signal(), send);
  expect(send).toHaveBeenCalledTimes(1);
  expect(f.first.inspect(run.id)?.reason).toBe("no_recipient");
  f.a.prepare("UPDATE user SET email='new@example.test'").run();
  send.mockResolvedValue(undefined);
  await runWatchJob(f.second, f.second.runnable()[0]!, signal(), send);
  expect(send.mock.calls.at(-1)?.[0].to).toBe("new@example.test");
  expect(f.first.inspect(run.id)?.phase).toBe("sent");
});

it("deleted watches cancel retained work and stale baseline updates are refused", async () => {
  const f = await fixture();
  f.first.reserveDue(1000);
  const run = f.first.runnable()[0]!,
    owner = f.first.claim(run.id)!;
  f.a.prepare("UPDATE watches SET last_run_at=55").run();
  f.first.prepare(
    run.id,
    owner,
    f.prior,
    { subject: "Fixture", text: "Fixture" },
    1,
  );
  expect(f.first.inspect(run.id)?.phase).toBe("obsolete");
  expect(f.a.prepare("SELECT last_run_at FROM watches").get()).toEqual({
    last_run_at: 55,
  });
  f.first.reserveDue(1000);
  f.a.prepare("DELETE FROM watches").run();
  expect(f.first.runnable()).toEqual([]);
  expect(f.a.prepare("SELECT count(*) n FROM watch_runs").get()).toEqual({
    n: 0,
  });
});

it("draining prevents claiming, provider calls, and mail", async () => {
  const f = await fixture();
  f.first.reserveDue(1000);
  const send = vi.fn();
  const check = vi.fn();
  await runWatchJob(f.first, f.first.runnable()[0]!, signal(), send, {
    draining: () => true,
    catalog: [{ ...provider("fixture", "available"), check }],
  });
  expect(send).not.toHaveBeenCalled();
  expect(check).not.toHaveBeenCalled();
  expect(f.first.runnable()).toHaveLength(1);
});

it("held receipts do not starve work beyond a bounded scan page", async () => {
  const f = await fixture();
  for (let i = 0; i < 10; i += 1)
    f.a
      .prepare(
        "INSERT INTO watches SELECT ?,user_id,query,categories_csv,providers_csv,created_at,last_run_at,last_summary_json FROM watches WHERE id='watch'",
      )
      .run(`watch-${i}`);
  expect(f.first.reserveDue(1000)).toBe(11);
  const firstPage = f.first.runnable();
  expect(firstPage).toHaveLength(10);
  for (const run of firstPage)
    f.first.release(run.id, f.first.claim(run.id)!, "requires_newer_release");
  expect(firstPage.some((run) => run.id === f.second.runnable()[0]!.id)).toBe(
    false,
  );
});

it("renews ownership during a send so an overlapping replica cannot acquire it", async () => {
  const f = await fixture();
  f.first.reserveDue(1000);
  const run = f.first.runnable()[0]!;
  let complete!: () => void;
  const send = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  const active = runWatchJob(f.first, run, signal(), send, {
    catalog: [provider("fixture", "available")],
  });
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  const owner = f.first.inspect(run.id)!.worker!;
  f.advance(9000);
  await new Promise((resolve) => setTimeout(resolve, 300));
  f.advance(2000);
  expect(f.second.claim(run.id)).toBeNull();
  expect(f.first.current(run.id, owner).phase).toBe("sending");
  complete();
  await active;
  expect(f.first.inspect(run.id)?.phase).toBe("sent");
});

it("bounds completed-receipt retention while preserving unresolved intents", async () => {
  const f = await fixture();
  const phases = [
    "checking",
    "pending",
    "sending",
    "uncertain",
    "sent",
    "no_change",
    "obsolete",
  ];
  for (let i = 1; i < phases.length; i += 1)
    f.a
      .prepare(
        "INSERT INTO watches SELECT ?,user_id,query,categories_csv,providers_csv,created_at,last_run_at,last_summary_json FROM watches WHERE id='watch'",
      )
      .run(`retention-${i}`);
  f.first.reserveDue(1000);
  const runs = f.first.runnable();
  for (let i = 0; i < runs.length; i += 1) {
    f.a
      .prepare("UPDATE watch_runs SET phase=? WHERE id=?")
      .run(phases[i], runs[i]!.id);
    f.a
      .prepare("INSERT INTO watch_run_results VALUES (?,?,?)")
      .run(runs[i]!.id, "fixture", JSON.stringify(f.prior.results[0]));
  }
  f.advance(7 * 24 * 60 * 60 * 1000 + 1);
  f.second.runnable();
  expect(
    f.a.prepare("SELECT phase FROM watch_runs ORDER BY phase").all(),
  ).toEqual([
    { phase: "checking" },
    { phase: "pending" },
    { phase: "uncertain" },
    { phase: "uncertain" },
  ]);
  expect(f.a.prepare("SELECT count(*) n FROM watch_run_results").get()).toEqual(
    { n: 4 },
  );
});
