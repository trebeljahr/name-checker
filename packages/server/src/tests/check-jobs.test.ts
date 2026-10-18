import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCheckJobStore } from "../lib/check-jobs";
import { startCheckJob } from "../lib/check-job-worker";
import type { Provider } from "@starter/shared";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((fn) => fn());
});
function fixture(): { a: Database.Database; b: Database.Database } {
  const directory = mkdtempSync(join(tmpdir(), "check-jobs-test-"));
  const a = new Database(join(directory, "auth.db"));
  a.pragma("journal_mode=WAL");
  a.pragma("foreign_keys=ON");
  a.exec(
    "CREATE TABLE user(id TEXT PRIMARY KEY); INSERT INTO user VALUES ('alice'), ('bob'); CREATE TABLE usage_log(user_id TEXT,day TEXT,runs INTEGER,PRIMARY KEY(user_id,day));",
  );
  const b = new Database(join(directory, "auth.db"));
  b.pragma("foreign_keys=ON");
  cleanups.push(() => {
    a.close();
    b.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { a, b };
}
function input(overrides = {}) {
  return {
    id: randomUUID(),
    owner: "user:alice",
    userId: "alice",
    kind: "bulk" as const,
    payload: { queries: ["example"] },
    plan: "free" as const,
    names: 1,
    rateIdentity: "fixture",
    rateLimit: 1000,
    ...overrides,
  };
}

describe("durable check receipts", () => {
  it("replays a lost reply on another connection without charging again", () => {
    const { a, b } = fixture();
    const first = createCheckJobStore(a),
      second = createCheckJobStore(b);
    const request = input();
    expect(first.reserve(request).replay).toBe(false);
    expect(second.reserve(request).replay).toBe(true);
    expect(a.prepare("SELECT runs FROM usage_log").get()).toEqual({ runs: 1 });
    expect(() =>
      second.reserve({ ...request, payload: { queries: ["different"] } }),
    ).toThrow("operation_payload_mismatch");
    expect(() =>
      second.reserve({ ...request, owner: "user:bob", userId: "bob" }),
    ).toThrow("job_not_found");
    expect(() => second.events(request.id, "anonymous")).toThrow(
      "job_not_found",
    );
  });
  it("enforces a shared quota and shared IP bucket across replicas", () => {
    const { a, b } = fixture();
    const stores = [createCheckJobStore(a), createCheckJobStore(b)];
    for (let i = 0; i < 10; i++) stores[i % 2]!.reserve(input());
    expect(() => stores[0]!.reserve(input())).toThrow("free_limit_runs");
    const request = input({
      kind: "single",
      payload: { query: "x" },
      rateIdentity: "other",
      rateLimit: 1,
    });
    stores[0]!.reserve(request);
    expect(stores[1]!.reserve(request).replay).toBe(true);
    expect(() => stores[1]!.reserve({ ...request, id: randomUUID() })).toThrow(
      "rate_limited",
    );
  });
  it("fences a paused writer after another replica claims its expired lease", () => {
    const { a, b } = fixture();
    let now = 1000;
    const first = createCheckJobStore(a, () => now),
      second = createCheckJobStore(b, () => now);
    const request = input();
    first.reserve(request);
    const old = first.claim(request.id)!;
    expect(second.claim(request.id)).toBeNull();
    first.append(request.id, old, "start", "start", {});
    now += 5001;
    const successor = second.claim(request.id)!;
    expect(successor).not.toBe(old);
    expect(() => first.append(request.id, old, "bad", "result", {})).toThrow(
      "job_lease_lost",
    );
    first.release(request.id, old);
    expect(second.renew(request.id, successor)).toBe(true);
    second.append(request.id, successor, "done", "done", {}, true);
    expect(
      second.events(request.id, request.owner).map((e) => e.event),
    ).toEqual(["start", "done"]);
  });
  it("keeps an expired receipt from becoming another charge", () => {
    const { a } = fixture();
    let now = 1000;
    const store = createCheckJobStore(a, () => now);
    const request = input();
    store.reserve(request);
    now += 7 * 86400_000;
    expect(() => store.reserve(request)).toThrow("job_expired");
    expect(a.prepare("SELECT runs FROM usage_log").get()).toEqual({ runs: 1 });
  });
  it("renews a long check then hands off only unfinished providers on drain", async () => {
    const { a, b } = fixture();
    const first = createCheckJobStore(a),
      second = createCheckJobStore(b);
    const request = input();
    const { job } = first.reserve(request);
    let firstCalls = 0,
      secondCalls = 0,
      drain = false;
    const catalog: Provider[] = [
      {
        id: "fast",
        name: "fast",
        category: "social",
        async check() {
          firstCalls++;
          return { status: "available" };
        },
      },
      {
        id: "slow",
        name: "slow",
        category: "social",
        async check() {
          secondCalls++;
          return await new Promise(() => {});
        },
      },
    ];
    const running = startCheckJob(
      first,
      job,
      new AbortController().signal,
      () => drain,
      catalog,
    );
    await new Promise((resolve) => setTimeout(resolve, 5200));
    expect(second.claim(job.id)).toBeNull(); // More than one full lease interval.
    drain = true;
    await running;
    expect(first.owned(job.id, request.owner).state).toBe("pending");
    catalog[1] = {
      ...catalog[1]!,
      async check() {
        secondCalls++;
        return { status: "taken" };
      },
    };
    await startCheckJob(
      second,
      job,
      new AbortController().signal,
      () => false,
      catalog,
    );
    const events = second.events(job.id, request.owner);
    expect(events.filter((e) => e.event === "result")).toHaveLength(2);
    expect(events.at(-1)?.event).toBe("done");
    expect(firstCalls).toBe(1);
    expect(secondCalls).toBe(2);
    expect(a.prepare("SELECT runs FROM usage_log").get()).toEqual({ runs: 1 });
  }, 10_000);
});
