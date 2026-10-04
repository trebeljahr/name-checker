import {
  bulkCheckRequestSchema,
  checkRequestSchema,
  compareRequestSchema,
} from "@starter/shared";
import { z } from "zod";
import { CheckJobError, type createCheckJobStore } from "./check-jobs";
import type { Plan } from "./plan-constants";
import type { Provider } from "@starter/shared";
import { startCheckJob } from "./check-job-worker";

const envelope = z
  .object({
    operationId: z.string().uuid(),
    owner: z.string().max(200),
    after: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .default(0),
  })
  .and(
    z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("single"), input: checkRequestSchema }),
      z.object({ kind: z.literal("bulk"), input: bulkCheckRequestSchema }),
      z.object({ kind: z.literal("compare"), input: compareRequestSchema }),
    ]),
  );

export function createCheckJobsHandler(options: {
  store: ReturnType<typeof createCheckJobStore>;
  session: (req: Request) => Promise<{ userId: string; plan: Plan } | null>;
  rateIdentity: (req: Request) => string;
  rateLimit: number;
  draining?: () => boolean;
  catalog?: Provider[];
}): (req: Request) => Promise<Response> {
  const draining =
    options.draining ?? (() => process.env.HATCHKIT_DRAINING === "1");
  return async function handle(req: Request): Promise<Response> {
    try {
      const parsed = envelope.safeParse(await req.json());
      if (!parsed.success)
        return Response.json({ error: "invalid_request" }, { status: 400 });
      const data = parsed.data;
      const session = await options.session(req);
      const userId = session?.userId;
      const owner = userId ? `user:${userId}` : "anonymous";
      if (owner !== data.owner) throw new CheckJobError("session_changed", 401);
      const store = options.store;
      const { job } = store.reserve({
        id: data.operationId,
        owner,
        userId,
        kind: data.kind,
        payload: data.input,
        plan: session?.plan ?? "free",
        names: "queries" in data.input ? data.input.queries.length : 1,
        rateIdentity: options.rateIdentity(req),
        rateLimit: options.rateLimit,
      });
      const encoder = new TextEncoder();
      const lifetime = new AbortController();
      const cancel = (): void => lifetime.abort();
      req.signal.addEventListener("abort", cancel, { once: true });
      if (req.signal.aborted) cancel();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let after = data.after;
          let worker: Promise<void> | undefined;
          let checkedAt = Date.now();
          let pingAt = checkedAt;
          const send = (
            event: string,
            value: unknown,
            sequence?: number,
          ): void => {
            controller.enqueue(
              encoder.encode(
                `${sequence ? `id: ${sequence}\n` : ""}event: ${event}\ndata: ${JSON.stringify(value)}\n\n`,
              ),
            );
          };
          try {
            while (!lifetime.signal.aborted) {
              if (Date.now() - checkedAt >= 2000) {
                const current = await options.session(req);
                if (
                  (current?.userId ? `user:${current.userId}` : "anonymous") !==
                  owner
                ) {
                  send("error", {
                    code: "session_changed",
                    message:
                      "Your sign-in changed. Sign in again to resume this check.",
                  });
                  break;
                }
                checkedAt = Date.now();
              }
              if (
                controller.desiredSize !== null &&
                controller.desiredSize <= 0
              ) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                continue;
              }
              const events = store.events(job.id, owner, after);
              if (
                events.length === 0 &&
                store.owned(job.id, owner).state === "done"
              ) {
                send("error", {
                  code: "invalid_event_cursor",
                  message:
                    "This check is complete. Reload the page and resume to restore its results.",
                });
                break;
              }
              for (const event of events) {
                send(event.event, event.data, event.sequence);
                after = event.sequence;
              }
              if (events.some((event) => event.event === "done")) break;
              // Drain immediately hands the saved cursor to the next replica.
              // No provider request or long stream needs to fit the stop budget.
              if (draining()) {
                send("reconnect", {});
                break;
              }
              if (!worker) {
                worker = startCheckJob(
                  store,
                  job,
                  lifetime.signal,
                  draining,
                  options.catalog,
                ).finally(() => {
                  worker = undefined;
                });
              }
              if (Date.now() - pingAt >= 5000) {
                send("ping", {});
                pingAt = Date.now();
              }
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
          } catch {
            if (!lifetime.signal.aborted) send("reconnect", {});
          } finally {
            cancel();
            await worker;
            req.signal.removeEventListener("abort", cancel);
            if (!req.signal.aborted) {
              try {
                controller.close();
              } catch {
                /* Consumer already cancelled. */
              }
            }
          }
        },
        cancel,
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "private, no-store, no-transform",
          "x-accel-buffering": "no",
          "x-check-jobs-protocol": "1",
        },
      });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof CheckJobError ? error.code : "check_unavailable",
        },
        {
          status:
            error instanceof CheckJobError
              ? error.status
              : error instanceof SyntaxError
                ? 400
                : 503,
        },
      );
    }
  };
}
