import type { Request as ExpressRequest, RequestHandler, Response as ExpressResponse } from "express";

/**
 * The API handlers take a Fetch `Request` and return a `Response`, the
 * signature they had as Next route handlers. This adapter runs one inside
 * Express, so the handlers, their tests and the HTTP contract the web
 * client, CLI, MCP server and extension rely on stay the same.
 */
export type WebHandler = (
  req: Request,
  ctx: { params: Promise<Record<string, string | undefined>> },
) => Response | Promise<Response>;

/** Requests above this size are refused before a handler sees them. */
export const MAX_BODY_BYTES = 1024 * 1024;

class BodyTooLargeError extends Error {}

export function webHandler(handler: WebHandler): RequestHandler {
  return async (req, res, next) => {
    // Aborts the handler's work (provider checks, SSE streams) when the
    // client goes away, as Next did through `request.signal`.
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });
    let request: Request;
    try {
      request = await toWebRequest(req, controller.signal);
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        res.status(413).json({ error: "request body too large" });
        return;
      }
      next(err);
      return;
    }
    let response: Response;
    try {
      response = await handler(request, { params: Promise.resolve(routeParams(req)) });
    } catch (err) {
      next(err);
      return;
    }
    await sendWebResponse(response, req, res, controller.signal);
  };
}

/** Path parameters as Next passed them; a wildcard's parts are rejoined. */
function routeParams(req: ExpressRequest): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.params as Record<string, string | string[]>)) {
    params[key] = Array.isArray(value) ? value.join("/") : value;
  }
  return params;
}

/**
 * The public origin, as the visitor used it. Behind Traefik (`trust proxy`),
 * `req.protocol` and `req.host` read X-Forwarded-Proto/-Host, so
 * `new URL(request.url).origin` is `https://names.trebeljahr.com`, which the
 * passport callback compares against BETTER_AUTH_URL.
 */
function requestUrl(req: ExpressRequest): URL {
  return new URL(req.originalUrl, `${req.protocol}://${req.host}`);
}

async function toWebRequest(req: ExpressRequest, signal: AbortSignal): Promise<Request> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await readBody(req) : undefined;
  return new Request(requestUrl(req), {
    method: req.method,
    headers,
    body: body && body.length > 0 ? new Uint8Array(body) : undefined,
    signal,
  });
}

async function readBody(req: ExpressRequest): Promise<Buffer> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new BodyTooLargeError();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLargeError();
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function sendWebResponse(
  response: Response,
  req: ExpressRequest,
  res: ExpressResponse,
  signal: AbortSignal,
): Promise<void> {
  res.status(response.status);
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") res.setHeader(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) res.setHeader("set-cookie", cookies);

  if (!response.body || req.method === "HEAD") {
    await response.body?.cancel().catch(() => undefined);
    res.end();
    return;
  }
  // Server-sent events: send the headers now, then each chunk as it comes.
  res.flushHeaders();
  const reader = response.body.getReader();
  const stop = (): void => {
    reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", stop, { once: true });
  // The client may have left while the handler was still working.
  if (signal.aborted) stop();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(value)) {
        await drainOrClose(res);
        if (res.destroyed) break;
      }
    }
    res.end();
  } catch {
    // The handler's stream failed after the status was sent: cut the
    // connection so the client sees an incomplete response, not a clean end.
    res.destroy();
  } finally {
    signal.removeEventListener("abort", stop);
  }
}

/** Wait for room in the socket buffer, or for the client to go away. */
function drainOrClose(res: ExpressResponse): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      res.off("drain", done);
      res.off("close", done);
      resolve();
    };
    res.on("drain", done);
    res.on("close", done);
  });
}
