import { expect, it } from "vitest";
import { createRequire } from "node:module";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import Database from "better-sqlite3";
import { prepareCheck, streamCheckJob } from "../../../client/src/lib/check-job-client";

// Opt-in real process/35-second operation proof; other tests remain quick.
it.skipIf(process.env.RUN_ROLLING_HTTP_PROOF !== "1")(
  "resumes a 35-second stream across real process retirement with one usage receipt",
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "name-checker-stream-proof-"));
    const file = join(directory, "auth.db");
    const processes: ChildProcess[] = [];
    const require = createRequire(import.meta.url);
    const fromVitest = createRequire(require.resolve("vitest/package.json"));
    const fromVite = createRequire(fromVitest.resolve("vite/package.json"));
    const { build } = fromVite("esbuild") as {
      build: (options: Record<string, unknown>) => Promise<void>;
    };
    const bundle = join(directory, "server.mjs");
    let db: Database.Database | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    try {
      symlinkSync(
        resolve("node_modules"),
        join(directory, "node_modules"),
        "dir",
      );
      await build({
        entryPoints: [resolve("src/tests/fixtures/check-job-server.ts")],
        outfile: bundle,
        bundle: true,
        platform: "node",
        target: "node24",
        format: "esm",
        banner: {
          js: 'import { createRequire as fixtureRequire } from "node:module"; const require = fixtureRequire(import.meta.url);',
        },
        external: ["better-sqlite3"],
        logLevel: "silent",
      });
      async function start(): Promise<{ child: ChildProcess; origin: string }> {
        const child = spawn(
          process.execPath,
          ["--require", resolve("../../drain.cjs"), bundle, file],
          {
            cwd: directory,
            stdio: ["ignore", "pipe", "pipe"],
            env: {
              NODE_ENV: "test",
              PATH: process.env.PATH,
              NODE_PATH: resolve("node_modules"),
              SHUTDOWN_DRAIN_SECONDS: "20",
              HEALTH_CHECK_PATH: "/api/health",
            },
          },
        );
        processes.push(child);
        let diagnostics = "";
        child.stderr!.on("data", (chunk: Buffer) => {
          diagnostics = (diagnostics + chunk.toString()).slice(-4000);
        });
        const port = await new Promise<number>((done, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("fixture startup timed out")),
            10_000,
          );
          child.once("exit", () => {
            clearTimeout(timeout);
            reject(new Error(`fixture startup failed: ${diagnostics}`));
          });
          child.stdout!.once("data", (chunk: Buffer) => {
            clearTimeout(timeout);
            done(
              (JSON.parse(chunk.toString().split("\n")[0]!) as { port: number })
                .port,
            );
          });
        });
        return { child, origin: `http://127.0.0.1:${port}` };
      }
      const a = await start(),
        b = await start();
      db = new Database(file);
      db.pragma("busy_timeout=5000");
      const values = new Map<string, string>();
      const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
        removeItem: (key: string) => {
          values.delete(key);
        },
      };
      const job = prepareCheck(storage, "bulk", "user:alice", {
        queries: ["synthetic-fixture"],
        timeoutMs: 60_000,
      });
      let retiring = false,
        termAt = 0,
        exitAt = 0,
        requests = 0;
      const events: string[] = [],
        ids: string[] = [];
      const statuses: number[] = [];
      const oldExit = once(a.child, "exit").then(([code, signal]) => {
        exitAt = performance.now();
        expect(code).toBe(0);
        expect(signal).toBeNull();
      });
      poll = setInterval(() => {
        void fetch(`${retiring ? b.origin : a.origin}/api/health`)
          .then((r) => statuses.push(r.status))
          .catch(() => statuses.push(0));
      }, 200);
      const fetcher: typeof fetch = async (_url, init) => {
        requests++;
        ids.push(
          (JSON.parse(init?.body as string) as { operationId: string })
            .operationId,
        );
        const response = await fetch(
          `${retiring ? b.origin : a.origin}/api/check/jobs`,
          {
            ...init,
            headers: { ...init?.headers, authorization: "alice-session" },
          },
        );
        return response;
      };
      await streamCheckJob(
        job,
        storage,
        (event) => {
          if (event.event === "result")
            events.push((event.data as { providerId: string }).providerId);
          if (event.event === "result" && !retiring) {
            retiring = true;
            termAt = performance.now();
            a.child.kill("SIGTERM");
          }
        },
        AbortSignal.timeout(65_000),
        { fetch: fetcher, retryMs: 100 },
      );
      await oldExit;
      expect(performance.now() - termAt).toBeGreaterThan(30_000);
      expect(exitAt - termAt).toBeGreaterThanOrEqual(19_500);
      expect(exitAt - termAt).toBeLessThan(28_000);
      expect(events.sort()).toEqual(["fixture-fast", "fixture-slow"]);
      expect(new Set(ids)).toEqual(new Set([job.operationId]));
      expect(requests).toBeGreaterThan(1);
      expect(db.prepare("SELECT runs FROM usage_log").get()).toEqual({
        runs: 1,
      });
      expect(
        db
          .prepare("SELECT count FROM fixture_calls WHERE provider='fast'")
          .get(),
      ).toEqual({ count: 1 });
      expect(statuses.length).toBeGreaterThan(100);
      expect(statuses.every((status) => status === 200)).toBe(true);
      const other = await fetch(`${b.origin}/api/check/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "bob-session",
        },
        body: JSON.stringify({ ...job, owner: "user:bob", after: 0 }),
      });
      expect(other.status).toBe(404);
      const replay = await fetch(`${b.origin}/api/check/jobs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "alice-session",
        },
        body: JSON.stringify({ ...job, after: 0 }),
      });
      expect((await replay.text()).match(/event: done/g)).toHaveLength(1);
      expect(db.prepare("SELECT runs FROM usage_log").get()).toEqual({
        runs: 1,
      });
      clearInterval(poll);
      poll = undefined;
      const c = await start();
      const crashedJob = prepareCheck(storage, "bulk", "user:alice", {
        queries: ["crash-fixture"],
        timeoutMs: 60_000,
      });
      let crashed = false;
      const crashResults: string[] = [];
      const crashExit = once(b.child, "exit");
      await streamCheckJob(
        crashedJob,
        storage,
        (event) => {
          if (event.event !== "result") return;
          crashResults.push((event.data as { providerId: string }).providerId);
          if (!crashed) {
            crashed = true;
            b.child.kill("SIGKILL");
          }
        },
        AbortSignal.timeout(15_000),
        {
          retryMs: 100,
          fetch: async (_url, init) =>
            fetch(`${crashed ? c.origin : b.origin}/api/check/jobs`, {
              ...init,
              headers: { ...init?.headers, authorization: "alice-session" },
            }),
        },
      );
      expect((await crashExit)[1]).toBe("SIGKILL");
      expect(crashResults.sort()).toEqual(["fixture-fast", "fixture-slow"]);
      expect(db.prepare("SELECT runs FROM usage_log").get()).toEqual({
        runs: 2,
      });
      expect(
        db
          .prepare("SELECT count FROM fixture_calls WHERE provider='fast'")
          .get(),
      ).toEqual({ count: 2 });
      const loggedOut = prepareCheck(storage, "bulk", "user:alice", {
        queries: ["logout-fixture"],
        timeoutMs: 60_000,
      });
      let revoked = false;
      await expect(
        streamCheckJob(
          loggedOut,
          storage,
          (event) => {
            if (event.event === "result" && !revoked) {
              revoked = true;
              // Session deletion through another database connection must terminate
              // the live stream, rather than caching handshake authentication.
              db!
                .prepare("DELETE FROM fixture_sessions WHERE user_id='alice'")
                .run();
            }
          },
          AbortSignal.timeout(10_000),
          {
            retryMs: 100,
            fetch: async (_url, init) =>
              fetch(`${c.origin}/api/check/jobs`, {
                ...init,
                headers: { ...init?.headers, authorization: "alice-session" },
              }),
          },
        ),
      ).rejects.toThrow("sign-in changed");
      expect(revoked).toBe(true);
      expect(
        db
          .prepare("SELECT state FROM check_jobs WHERE id=?")
          .get(loggedOut.operationId),
      ).toEqual({ state: "pending" });
      const proof = {
        proof: "name-checker-process-retirement",
        requests,
        httpSamples: statuses.length,
        httpFailures: statuses.filter((status) => status !== 200).length,
        drainMs: Math.round(exitAt - termAt),
        preservedResults: events.length,
        gracefulUsageRuns: 1,
        crashedUsageRuns: 2,
        completedProviderNotRepeated: true,
        crashRecovery: true,
        accountIsolation: true,
        crossConnectionLogoutTerminatesStream: true,
      };
      if (process.env.ROLLING_PROOF_REPORT)
        writeFileSync(
          process.env.ROLLING_PROOF_REPORT,
          JSON.stringify(proof, null, 2) + "\n",
          { mode: 0o600 },
        );
      console.log(JSON.stringify(proof));
    } finally {
      clearInterval(poll);
      db?.close();
      for (const child of processes)
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
          await once(child, "exit").catch(() => undefined);
        }
      rmSync(directory, { recursive: true, force: true });
    }
  },
  80_000,
);
