#!/usr/bin/env node
// Checks `out/` before it is uploaded to the Cloudflare Worker.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../out", import.meta.url));
const problems = [];

// Workers Free: 20,000 files per version, 25 MiB per file.
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else files.push(path);
  }
}
if (!existsSync(out)) {
  console.error("out/ does not exist: run `next build` first");
  process.exit(1);
}
walk(out);

for (const required of [
  "index.html",
  "404.html",
  "check/index.html",
  "check/_/index.html",
  "passport/_/index.html",
  "account/index.html",
  "compare/index.html",
  "privacy/index.html",
  "_redirects",
  "_headers",
  "version.json",
]) {
  if (!existsSync(join(out, required))) problems.push(`missing ${required}`);
}
if (existsSync(join(out, "api"))) problems.push("out/api exists: /api/* belongs to the API server");
if (files.length > MAX_FILES) problems.push(`${files.length} files, over ${MAX_FILES}`);
for (const file of files) {
  const rel = relative(out, file);
  if (statSync(file).size > MAX_FILE_BYTES) problems.push(`${rel} is over 25 MiB`);
  if (/\.(html|js|json|txt)$/.test(rel)) {
    const text = readFileSync(file, "utf8");
    // A relative prefix breaks every page below the root.
    if (rel.endsWith(".html") && text.includes('"./_next')) problems.push(`${rel} references ./_next`);
    // dotenvx ciphertext from .env.production must never ship.
    if (/encrypted:[A-Za-z0-9+/=]{40,}/.test(text)) {
      problems.push(`${rel} contains dotenvx ciphertext`);
    }
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`check-export: ${p}`);
  process.exit(1);
}
console.log(`check-export: ${files.length} files OK`);
