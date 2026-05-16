import * as esbuild from "esbuild";
import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const srcDir = path.join(pkgRoot, "src");
const distDir = path.join(pkgRoot, "dist");

const CONTENT_SCRIPTS = [
  "x",
  "tiktok",
  "instagram",
  "reddit",
  "twitch",
  "threads",
  "linkedin",
] as const;

const watch = process.argv.includes("--watch");

const passportOrigin =
  process.env.NEXT_PUBLIC_PASSPORT_ORIGIN ??
  process.env.PASSPORT_ORIGIN ??
  "http://localhost:3000";

const defineGlobals: Record<string, string> = {
  "globalThis.PASSPORT_ORIGIN": JSON.stringify(passportOrigin),
};

const sharedOpts: esbuild.BuildOptions = {
  bundle: true,
  format: "esm",
  target: ["chrome120"],
  platform: "browser",
  sourcemap: true,
  minify: !watch,
  logLevel: "info",
  define: defineGlobals,
};

const contentEntries = Object.fromEntries(
  CONTENT_SCRIPTS.map((n) => [`content/${n}`, path.join(srcDir, "content", `${n}.ts`)]),
);

const buildAll = async (): Promise<esbuild.BuildContext[]> => {
  if (existsSync(distDir)) await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await mkdir(path.join(distDir, "content"), { recursive: true });
  await mkdir(path.join(distDir, "popup"), { recursive: true });

  const contexts: esbuild.BuildContext[] = [];

  const background = await esbuild.context({
    ...sharedOpts,
    entryPoints: [path.join(srcDir, "background.ts")],
    outfile: path.join(distDir, "background.js"),
  });
  contexts.push(background);

  const content = await esbuild.context({
    ...sharedOpts,
    entryPoints: contentEntries,
    outdir: distDir,
  });
  contexts.push(content);

  const popup = await esbuild.context({
    ...sharedOpts,
    entryPoints: [path.join(srcDir, "popup", "popup.tsx")],
    outfile: path.join(distDir, "popup", "popup.js"),
    jsx: "automatic",
    loader: { ".css": "css" },
  });
  contexts.push(popup);

  await Promise.all(contexts.map((c) => c.rebuild()));

  await cp(path.join(srcDir, "popup", "index.html"), path.join(distDir, "popup", "index.html"));
  await cp(path.join(srcDir, "popup", "popup.css"), path.join(distDir, "popup", "popup.css"));

  const manifestRaw = await readFile(path.join(pkgRoot, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestRaw) as Record<string, unknown>;
  await writeFile(path.join(distDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  return contexts;
};

const main = async (): Promise<void> => {
  const ctxs = await buildAll();
  console.log(`[extension] built to ${path.relative(process.cwd(), distDir)} (origin=${passportOrigin})`);
  if (watch) {
    console.log("[extension] watching for changes…");
    await Promise.all(ctxs.map((c) => c.watch()));
  } else {
    await Promise.all(ctxs.map((c) => c.dispose()));
  }
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
