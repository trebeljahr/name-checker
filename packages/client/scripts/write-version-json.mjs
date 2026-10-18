#!/usr/bin/env node
// Writes out/version.json after `next build`. The release check compares
// its `commit` with the commit it just deployed; the pages carry the same
// value in <meta name="build-commit">.
import { writeFileSync } from "node:fs";

const commit = process.env.NEXT_PUBLIC_BUILD_COMMIT || "unknown";
writeFileSync(new URL("../out/version.json", import.meta.url), `${JSON.stringify({ commit })}\n`);
console.log(`out/version.json: ${commit}`);
