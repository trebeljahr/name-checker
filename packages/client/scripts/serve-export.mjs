#!/usr/bin/env node
/**
 * Serve `out/` the way production does, for e2e tests and local checks:
 *   - `/api/*` is proxied to the API server (API_PROXY_TARGET), as the
 *     Workers route with no Worker sends it to Coolify in production;
 *   - `_redirects`: the first matching rule wins; 200 serves another path,
 *     3xx redirects (placeholders `:name` and one `*` splat);
 *   - html_handling auto-trailing-slash: `/x/` serves `x/index.html`,
 *     `/x` redirects to `/x/` when that exists;
 *   - not_found_handling 404-page: `404.html` with status 404.
 * An approximation of Cloudflare's static assets, not a copy of it.
 *
 *   PORT=4000 API_PROXY_TARGET=http://127.0.0.1:5818 node scripts/serve-export.mjs
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../out", import.meta.url));
const port = Number(process.env.PORT ?? 4000);
const api = new URL(process.env.API_PROXY_TARGET ?? "http://127.0.0.1:5818");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function parseRedirects() {
  const file = join(out, "_redirects");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [source, destination, status = "302"] = line.split(/\s+/);
      const names = [];
      const pattern = source
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/:([A-Za-z]\w*)/g, (_, name) => {
          names.push(name);
          return "([^/]+)";
        })
        .replace(/\*/g, () => {
          names.push("splat");
          return "(.*)";
        });
      return { regex: new RegExp(`^${pattern}$`), names, destination, status: Number(status) };
    });
}
const redirects = parseRedirects();

function matchRedirect(pathname) {
  for (const rule of redirects) {
    const m = rule.regex.exec(pathname);
    if (!m) continue;
    let target = rule.destination;
    rule.names.forEach((name, i) => {
      target = target.replace(name === "splat" ? ":splat" : `:${name}`, m[i + 1]);
    });
    return { target, status: rule.status };
  }
  return null;
}

/** The file for a path, or a trailing-slash redirect, or null. */
function resolveAsset(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const path = join(out, safe);
  if (!path.startsWith(out)) return null;
  if (pathname.endsWith("/")) {
    const index = join(path, "index.html");
    return existsSync(index) ? { file: index } : null;
  }
  if (existsSync(path) && statSync(path).isFile()) return { file: path };
  if (existsSync(`${path}.html`)) return { file: `${path}.html` };
  if (existsSync(join(path, "index.html"))) return { redirect: `${pathname}/` };
  return null;
}

function sendFile(res, file, status = 200) {
  res.writeHead(status, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

function proxy(req, res) {
  const upstream = httpRequest(
    {
      host: api.hostname,
      port: api.port,
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
        "x-forwarded-host": req.headers.host ?? "",
        "x-forwarded-proto": "http",
      },
    },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502).end("API server unreachable\n");
    else res.destroy();
  });
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/")) return proxy(req, res);

  const rule = matchRedirect(url.pathname);
  let pathname = url.pathname;
  if (rule && rule.status >= 300 && rule.status < 400) {
    res.writeHead(rule.status, { location: rule.target }).end();
    return;
  }
  if (rule && rule.status === 200) pathname = rule.target;

  const asset = resolveAsset(pathname);
  if (asset?.redirect) {
    res.writeHead(307, { location: `${asset.redirect}${url.search}` }).end();
    return;
  }
  if (asset?.file) return sendFile(res, asset.file);
  sendFile(res, join(out, "404.html"), 404);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`serve-export: http://127.0.0.1:${port} (api → ${api.origin})`);
});
