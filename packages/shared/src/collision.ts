import type { CheckSummary } from "./types.js";
import { metaphone } from "./phonetic.js";
import { normalizeHomoglyphs } from "./homoglyph.js";

export type CollisionReport = {
  query: string;
  phoneticHits: Array<{ providerId: string; foundName: string; distance: number }>;
  homoglyphHits: Array<{ providerId: string; foundName: string }>;
};

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

const TOKEN_SPLIT = /[^\p{L}\p{N}]+/u;

export function scanCollisions(query: string, summary: CheckSummary): CollisionReport {
  const queryRawLower = query.toLowerCase();
  const queryNorm = normalizeHomoglyphs(query);
  const queryMeta = metaphone(queryNorm);

  const phoneticHits: CollisionReport["phoneticHits"] = [];
  const homoglyphHits: CollisionReport["homoglyphHits"] = [];
  const seenPhonetic = new Set<string>();
  const seenHomoglyph = new Set<string>();

  for (const result of summary.results) {
    const evidence = result.evidence ?? [];
    for (const ev of evidence) {
      if (!ev?.title) continue;
      const tokens = ev.title.split(TOKEN_SPLIT).filter((t) => t.length > 1);
      for (const token of tokens) {
        const candNorm = normalizeHomoglyphs(token);
        if (!candNorm) continue;
        const key = `${result.providerId}|${token}`;

        if (candNorm === queryNorm && token.toLowerCase() !== queryRawLower) {
          if (!seenHomoglyph.has(key)) {
            seenHomoglyph.add(key);
            homoglyphHits.push({ providerId: result.providerId, foundName: token });
          }
          continue;
        }

        const candMeta = metaphone(candNorm);
        const dist = levenshtein(candNorm, queryNorm);
        const phoneticMatch = candMeta !== "" && candMeta === queryMeta;
        const distMatch = dist > 0 && dist <= 2;

        if ((phoneticMatch || distMatch) && candNorm !== queryNorm) {
          if (!seenPhonetic.has(key)) {
            seenPhonetic.add(key);
            phoneticHits.push({
              providerId: result.providerId,
              foundName: token,
              distance: dist,
            });
          }
        }
      }
    }
  }

  return { query, phoneticHits, homoglyphHits };
}
