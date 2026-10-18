import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { auth } from "./lib/auth";
import { type WebHandler, webHandler } from "./http/web-handler";
import * as billingCheckout from "./routes/billing/checkout";
import * as billingPortal from "./routes/billing/portal";
import * as billingWebhook from "./routes/billing/webhook";
import * as check from "./routes/check/index";
import * as checkBulk from "./routes/check/bulk";
import * as checkCompare from "./routes/check/compare";
import * as checkJobs from "./routes/check/jobs";
import * as cronWatch from "./routes/cron/watch";
import * as health from "./routes/health";
import * as me from "./routes/me";
import * as passportBluesky from "./routes/passport/bluesky";
import * as passportCallback from "./routes/passport/callback";
import * as passportGithub from "./routes/passport/github";
import * as passportNpm from "./routes/passport/npm";
import * as passportStatus from "./routes/passport/status";
import * as variants from "./routes/variants";
import * as watch from "./routes/watch";

type Methods = Partial<Record<"GET" | "POST" | "DELETE", WebHandler>>;

/**
 * The public API. Paths and methods are the ones the Next route handlers
 * served under `packages/client/src/app/api/` until 2026-10-15; the web
 * client, CLI, MCP server and the extension depend on them, and so do the
 * Stripe webhook URL and the GitHub OAuth callback URL. Do not rename.
 */
export const ROUTES: ReadonlyArray<[path: string, methods: Methods]> = [
  ["/api/auth/{*rest}", { GET: auth.handler, POST: auth.handler }],
  ["/api/billing/checkout", billingCheckout],
  ["/api/billing/portal", billingPortal],
  ["/api/billing/webhook", billingWebhook],
  ["/api/check", check],
  ["/api/check/bulk", checkBulk],
  ["/api/check/compare", checkCompare],
  ["/api/check/jobs", checkJobs],
  ["/api/cron/watch", cronWatch],
  ["/api/health", health],
  ["/api/me", me],
  ["/api/passport/bluesky", passportBluesky],
  ["/api/passport/callback/:provider", passportCallback],
  ["/api/passport/github", passportGithub],
  ["/api/passport/npm", passportNpm],
  ["/api/passport/status", passportStatus],
  ["/api/variants", variants],
  ["/api/watch", watch],
];

/**
 * One path: dispatch on method. HEAD runs GET and OPTIONS lists the methods,
 * as Next did for route handlers; anything else is 405.
 */
function route(methods: Methods): RequestHandler {
  const handlers = new Map<string, RequestHandler>();
  for (const method of ["GET", "POST", "DELETE"] as const) {
    const handler = methods[method];
    if (handler) handlers.set(method, webHandler(handler));
  }
  const get = handlers.get("GET");
  if (get) handlers.set("HEAD", get);
  const allow = [...handlers.keys(), "OPTIONS"].join(", ");
  return (req, res, next) => {
    const handler = handlers.get(req.method);
    if (handler) return handler(req, res, next);
    res.status(req.method === "OPTIONS" ? 204 : 405).set("allow", allow).end();
  };
}

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  // One proxy hop: Traefik. Its X-Forwarded-Proto/-Host give handlers the
  // public origin (see http/web-handler.ts).
  app.set("trust proxy", 1);

  // No body parser: every handler reads its own body from the Fetch
  // Request, including the Stripe webhook, which needs the raw bytes.
  for (const [path, methods] of ROUTES) app.all(path, route(methods));

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error("[server] unhandled error", err);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.status(500).json({ error: "internal_error" });
  };
  app.use(onError);
  return app;
}
