import { createServer } from "node:http";
import { createApp } from "./app";
import { getDb } from "./lib/db";
import { closeHttpServer } from "./shutdown";
import { startBackgroundWorkers } from "./workers";

const port = Number(process.env.PORT) || 6657;
const host = process.env.HOSTNAME || "0.0.0.0";

const server = createServer(createApp());
server.listen(port, host, () => {
  console.log(`[server] listening on http://${host}:${port} (${process.env.NODE_ENV ?? "development"})`);
});
const workers = startBackgroundWorkers();

// Force exit when closing hangs. Counted from the start of shutdown, after
// the drain: 20 s of drain plus this stays under the 30 s `docker stop`
// allows before it kills the process.
const FORCE_EXIT_MS = 8_000;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  setTimeout(() => {
    console.error("[server] forced exit after timeout");
    process.exit(1);
  }, FORCE_EXIT_MS).unref();
  console.log(`[server] ${signal}: shutting down`);
  await workers?.stop();
  await closeHttpServer(server).catch(() => undefined);
  getDb().close();
  process.exit(0);
}

// SIGTERM is `docker stop`. The image starts this file with
// `--require drain.cjs`, which answers the health probe with 503 for
// SHUTDOWN_DRAIN_SECONDS, sets HATCHKIT_DRAINING=1 (check and watch jobs
// stop taking work) and holds this listener until the drain ends.
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
