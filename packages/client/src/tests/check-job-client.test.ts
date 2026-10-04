import { describe, expect, it } from "vitest";
import {
  dismissPendingCheck,
  prepareCheck,
  readPendingCheck,
  streamCheckJob,
} from "../lib/check-job-client";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
const response = (text: string): Response =>
  new Response(text, { headers: { "x-check-jobs-protocol": "1" } });
const frame = (id: number, event: string, data: unknown): string =>
  `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

describe("resumable check streams", () => {
  it("keeps the ID through a lost initial response and EOF, and skips duplicate events", async () => {
    const saved = storage();
    const job = prepareCheck(saved, "bulk", "user:alice", { queries: ["x"] });
    const calls: { operationId: string; after: number }[] = [];
    const events: string[] = [];
    const fetcher: typeof fetch = async (_, init) => {
      calls.push(JSON.parse(init?.body as string));
      if (calls.length === 1) throw new TypeError("lost response after commit");
      if (calls.length === 2) return response(frame(2, "result", { id: "a" })); // EOF is not completion.
      return response(frame(2, "result", { id: "a" }) + frame(7, "done", {}));
    };
    await streamCheckJob(
      job,
      saved,
      (event) => events.push(event.event),
      new AbortController().signal,
      { fetch: fetcher, retryMs: 1 },
    );
    expect(calls.map((call) => call.operationId)).toEqual([
      job.operationId,
      job.operationId,
      job.operationId,
    ]);
    expect(calls.map((call) => call.after)).toEqual([0, 0, 2]);
    expect(events).toEqual(["result", "done"]);
    expect(readPendingCheck(saved, "bulk", "user:alice")).toBeNull();
  });
  it("replays from zero after a page reload and never starts changed input implicitly", async () => {
    const saved = storage();
    const job = prepareCheck(saved, "bulk", "user:alice", { queries: ["x"] });
    expect(() =>
      prepareCheck(saved, "bulk", "user:alice", { queries: ["different"] }),
    ).toThrow("unfinished");
    const reloaded = readPendingCheck(saved, "bulk", "user:alice")!;
    await streamCheckJob(
      reloaded,
      saved,
      () => {},
      new AbortController().signal,
      {
        fetch: async (_, init) => {
          expect(JSON.parse(init?.body as string).after).toBe(0);
          return response(frame(7, "done", {}));
        },
      },
    );
    expect(reloaded.operationId).toBe(job.operationId);
  });
  it("keeps ambiguous failures and account errors pending, isolated by account", async () => {
    const saved = storage();
    const job = prepareCheck(saved, "bulk", "user:alice", { queries: ["x"] });
    expect(readPendingCheck(saved, "bulk", "user:bob")).toBeNull();
    await expect(
      streamCheckJob(job, saved, () => {}, new AbortController().signal, {
        fetch: async () => new Response("unavailable", { status: 503 }),
        retryMs: 1,
        maxRetries: 1,
      }),
    ).rejects.toThrow("saved");
    await expect(
      streamCheckJob(job, saved, () => {}, new AbortController().signal, {
        fetch: async () =>
          Response.json({ error: "session_changed" }, { status: 401 }),
      }),
    ).rejects.toThrow("original account");
    expect(readPendingCheck(saved, "bulk", "user:alice")?.operationId).toBe(
      job.operationId,
    );
  });
  it("does not send without durable browser storage", () => {
    const saved = storage();
    saved.setItem = () => {
      throw new Error("quota exceeded");
    };
    expect(() =>
      prepareCheck(saved, "bulk", "user:alice", { queries: ["x"] }),
    ).toThrow("quota exceeded");
  });
  it("retries unsupported legacy replicas without falling back to a chargeable endpoint", async () => {
    const saved = storage();
    const job = prepareCheck(saved, "single", "anonymous", { query: "x" });
    let count = 0;
    await streamCheckJob(job, saved, () => {}, new AbortController().signal, {
      retryMs: 1,
      fetch: async (url) => {
        expect(url).toBe("/api/check/jobs");
        return ++count === 1
          ? new Response("<html>legacy</html>")
          : response(frame(1, "done", {}));
      },
    });
    expect(count).toBe(2);
    dismissPendingCheck(saved, "single", "anonymous");
  });
});
