// Synthetic local HTTP fixture. Never included in the production application.
import { createServer } from "node:http";
import { Readable } from "node:stream";
import Database from "better-sqlite3";
import { createCheckJobsHandler } from "../../lib/check-job-handler";
import { createCheckJobStore } from "../../lib/check-jobs";

const file = process.argv[2]!;
if (!file.includes("name-checker-stream-proof-") || !file.endsWith("/auth.db"))
  throw new Error("fixture database required");
const db = new Database(file);
db.pragma("journal_mode=WAL");
db.pragma("busy_timeout=5000");
db.pragma("foreign_keys=ON");
db.exec(`CREATE TABLE IF NOT EXISTS user(id TEXT PRIMARY KEY);
  INSERT OR IGNORE INTO user VALUES ('alice'),('bob');
  CREATE TABLE IF NOT EXISTS usage_log(user_id TEXT,day TEXT,runs INTEGER,PRIMARY KEY(user_id,day));
  CREATE TABLE IF NOT EXISTS fixture_sessions(token TEXT PRIMARY KEY,user_id TEXT);
  CREATE TABLE IF NOT EXISTS fixture_calls(provider TEXT PRIMARY KEY,count INTEGER);
  INSERT OR IGNORE INTO fixture_sessions VALUES ('alice-session','alice'),('bob-session','bob');`);
const calls = db.prepare(
  "INSERT INTO fixture_calls VALUES (?,1) ON CONFLICT(provider) DO UPDATE SET count=count+1",
);
const handler = createCheckJobsHandler({
  store: createCheckJobStore(db),
  rateIdentity: () => "synthetic-loopback",
  rateLimit: 100,
  session: async (req) => {
    const row = db
      .prepare("SELECT user_id FROM fixture_sessions WHERE token=?")
      .get(req.headers.get("authorization")) as { user_id: string } | undefined;
    return row ? { userId: row.user_id, plan: "free" } : null;
  },
  catalog: [
    {
      id: "fixture-fast",
      name: "fixture fast",
      category: "social",
      async check() {
        calls.run("fast");
        return { status: "available" };
      },
    },
    {
      id: "fixture-slow",
      name: "fixture slow",
      category: "social",
      async check(query, signal) {
        calls.run("slow");
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => {
              signal?.removeEventListener("abort", abort);
              resolve();
            },
            query === "crash-fixture" ? 1000 : 35_000,
          );
          const abort = (): void => {
            clearTimeout(timer);
            reject(signal?.reason);
          };
          signal?.addEventListener("abort", abort, { once: true });
          if (signal?.aborted) abort();
        });
        return { status: "taken" };
      },
    },
  ],
});
const server = createServer(async (request, response) => {
  if (request.url === "/api/health") {
    db.prepare("SELECT 1").get();
    response.end("ready");
    return;
  }
  if (request.url !== "/api/check/jobs" || request.method !== "POST") {
    response.writeHead(404).end();
    return;
  }
  const controller = new AbortController();
  response.on("close", () => {
    if (!response.writableEnded) controller.abort();
  });
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers))
    if (typeof value === "string") headers.set(key, value);
  try {
    const result = await handler(
      new Request("http://127.0.0.1/api/check/jobs", {
        method: "POST",
        headers,
        body: Buffer.concat(chunks).toString(),
        signal: controller.signal,
      }),
    );
    response.writeHead(result.status, Object.fromEntries(result.headers));
    if (result.body)
      Readable.fromWeb(result.body as import("node:stream/web").ReadableStream)
        .on("error", () => response.destroy())
        .pipe(response);
    else response.end();
  } catch {
    response.writeHead(500).end();
  }
});
server.listen(0, "127.0.0.1", () =>
  process.stdout.write(
    JSON.stringify({ port: (server.address() as { port: number }).port }) +
      "\n",
  ),
);
process.on("SIGTERM", () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
