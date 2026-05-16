import { slug } from "./normalize.js";

export type VariantOpts = {
  count?: number;
  includeMutations?: boolean;
  includeCompounds?: boolean;
};

const PREFIXES = [
  "get",
  "play",
  "use",
  "try",
  "we",
  "hi",
  "go",
  "my",
  "the",
] as const;

const SUFFIXES = [
  "app",
  "io",
  "labs",
  "hq",
  "co",
  "hub",
  "works",
  "studio",
  "space",
  "wave",
] as const;

const COMPOUND_NOUNS = [
  "project",
  "protocol",
  "network",
  "engine",
  "system",
] as const;

const VOWELS = ["a", "e", "i", "o", "u"] as const;

const MIN_LEN = 3;
const MAX_LEN = 24;
const DEFAULT_COUNT = 20;

const LABEL_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeCandidate(v: string): string | null {
  if (!v) return null;
  if (v.length < MIN_LEN || v.length > MAX_LEN) return null;
  if (!LABEL_RE.test(v)) return null;
  return v;
}

export function suggestVariants(
  query: string,
  opts: VariantOpts = {},
): string[] {
  const count = Math.max(0, Math.floor(opts.count ?? DEFAULT_COUNT));
  const includeMutations = opts.includeMutations ?? false;
  const includeCompounds = opts.includeCompounds ?? true;

  const base = slug(query);
  if (!base || count === 0) return [];

  const seen = new Set<string>([base]);
  const out: string[] = [];

  const push = (raw: string): void => {
    const v = normalizeCandidate(raw);
    if (!v) return;
    if (seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };

  for (const p of PREFIXES) push(`${p}${base}`);
  for (const s of SUFFIXES) push(`${base}${s}`);

  for (const p of PREFIXES) push(`${p}-${base}`);
  for (const s of SUFFIXES) push(`${base}-${s}`);

  if (includeCompounds) {
    for (const n of COMPOUND_NOUNS) {
      if (base.includes(n)) continue;
      push(`${base}${n}`);
    }
  }

  push(base.slice(0, 4));
  push(base.slice(0, 5));

  if (includeMutations) {
    for (let i = 0; i < base.length; i++) {
      const ch = base[i]!;
      if (!(VOWELS as readonly string[]).includes(ch)) continue;
      for (const v of VOWELS) {
        if (v === ch) continue;
        push(base.slice(0, i) + v + base.slice(i + 1));
      }
    }
    if (base.length > MIN_LEN) push(base.slice(0, -1));
    const last = base[base.length - 1]!;
    if (last && !(VOWELS as readonly string[]).includes(last) && /[a-z]/.test(last)) {
      push(base + last);
    }
  }

  return out.slice(0, count);
}
