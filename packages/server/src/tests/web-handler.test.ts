import { afterAll, beforeAll, expect, it } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { MAX_BODY_BYTES, webHandler } from "../http/web-handler";

let server: Server;
let origin: string;
let aborted: Promise<void>;
let markAborted: () => void;

beforeAll(async () => {
  aborted = new Promise((resolve) => {
    markAborted = resolve;
  });
  const app = express();
  app.set("trust proxy", 1);
  app.all(
    "/echo/:name",
    webHandler(async (req, ctx) => {
      const body = req.method === "GET" ? "" : await req.text();
      return Response.json({
        url: req.url,
        method: req.method,
        params: await ctx.params,
        cookie: req.headers.get("cookie"),
        body,
      });
    }),
  );
  app.get(
    "/cookies",
    webHandler(() => {
      const headers = new Headers();
      headers.append("set-cookie", "a=1; Path=/");
      headers.append("set-cookie", "b=2; Path=/");
      return new Response(null, { status: 204, headers });
    }),
  );
  app.get(
    "/redirect",
    webHandler(() => Response.redirect("https://names.example/passport/acme#github=reserved", 302)),
  );
  app.get(
    "/stream",
    webHandler((req) => {
      req.signal.addEventListener("abort", () => markAborted(), { once: true });
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("event: start\ndata: {}\n\n"));
          // Never closes on its own: only a client disconnect ends it.
        },
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream" } });
    }),
  );
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

it("gives the handler the public URL from the proxy's forwarded headers", async () => {
  const res = await fetch(`${origin}/echo/github?code=x`, {
    headers: {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "names.example",
      cookie: "session=abc",
    },
  });
  expect(await res.json()).toEqual({
    url: "https://names.example/echo/github?code=x",
    method: "GET",
    params: { name: "github" },
    cookie: "session=abc",
    body: "",
  });
});

it("passes the raw request body", async () => {
  const raw = '{"id":"evt_1",  "spacing":"kept"}';
  const res = await fetch(`${origin}/echo/x`, { method: "POST", body: raw });
  expect(((await res.json()) as { body: string }).body).toBe(raw);
});

it("refuses a body over the limit", async () => {
  const res = await fetch(`${origin}/echo/x`, {
    method: "POST",
    body: "x".repeat(MAX_BODY_BYTES + 1),
  });
  expect(res.status).toBe(413);
});

it("keeps every Set-Cookie header", async () => {
  const res = await fetch(`${origin}/cookies`);
  expect(res.status).toBe(204);
  expect(res.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
});

it("passes redirects through without following them", async () => {
  const res = await fetch(`${origin}/redirect`, { redirect: "manual" });
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("https://names.example/passport/acme#github=reserved");
});

it("streams events and aborts the handler when the client disconnects", async () => {
  const controller = new AbortController();
  const res = await fetch(`${origin}/stream`, { signal: controller.signal });
  expect(res.headers.get("content-type")).toBe("text/event-stream");
  const reader = res.body!.getReader();
  const first = await reader.read();
  expect(new TextDecoder().decode(first.value)).toContain("event: start");
  controller.abort();
  await expect(aborted).resolves.toBeUndefined();
});
