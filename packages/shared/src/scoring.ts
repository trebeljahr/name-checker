import type {
  ProviderCategory,
  ProviderResult,
  ScoreBreakdownEntry,
  Subverdict,
} from "./types.js";

export type ScoreResult = {
  score: number;
  breakdown: ScoreBreakdownEntry[];
  subverdicts: Record<ProviderCategory, Subverdict>;
};

const STARTING_SCORE = 100;
const SOCIAL_BIG = new Set(["x", "instagram", "youtube", "tiktok"]);
const SOCIAL_BIG_CAP = -12;
const PRIMARY_BRAND_TLDS = new Set(["io", "ai", "gg", "dev"]);
const OFF_BRAND_TLDS = new Set(["fun", "lol"]);
const ALL_CATEGORIES: ProviderCategory[] = [
  "trademark",
  "domain",
  "social",
  "appstore",
  "package",
  "code",
];

export function scoreSummary(results: ProviderResult[]): ScoreResult {
  const breakdown: ScoreBreakdownEntry[] = [];
  let score = STARTING_SCORE;

  const byCategory = groupByCategory(results);
  const deltaByCategory: Record<ProviderCategory, number> = {
    trademark: 0,
    domain: 0,
    social: 0,
    appstore: 0,
    package: 0,
    code: 0,
  };

  deltaByCategory.trademark = scoreTrademark(byCategory.trademark, breakdown);
  deltaByCategory.domain = scoreDomain(byCategory.domain, breakdown);
  deltaByCategory.social = scoreSocial(byCategory.social, breakdown);
  deltaByCategory.appstore = scoreAppstore(byCategory.appstore, breakdown);
  deltaByCategory.package = scorePackage(byCategory.package, breakdown);
  deltaByCategory.code = scoreCode(byCategory.code, breakdown);

  for (const cat of ALL_CATEGORIES) score += deltaByCategory[cat];

  score += applyBonuses(byCategory, breakdown);

  score = Math.max(0, Math.min(100, score));

  const subverdicts: Record<ProviderCategory, Subverdict> = {
    trademark: subverdictFor(byCategory.trademark, deltaByCategory.trademark),
    domain: subverdictFor(byCategory.domain, deltaByCategory.domain),
    social: subverdictFor(byCategory.social, deltaByCategory.social),
    appstore: subverdictFor(byCategory.appstore, deltaByCategory.appstore),
    package: subverdictFor(byCategory.package, deltaByCategory.package),
    code: subverdictFor(byCategory.code, deltaByCategory.code),
  };

  return { score, breakdown, subverdicts };
}

function groupByCategory(
  results: ProviderResult[],
): Record<ProviderCategory, ProviderResult[]> {
  const out: Record<ProviderCategory, ProviderResult[]> = {
    trademark: [],
    domain: [],
    social: [],
    appstore: [],
    package: [],
    code: [],
  };
  for (const r of results) out[r.category].push(r);
  return out;
}

function scoreTrademark(
  results: ProviderResult[],
  breakdown: ScoreBreakdownEntry[],
): number {
  let worst: ScoreBreakdownEntry | null = null;
  for (const r of results) {
    const cls = classifyTrademark(r);
    if (cls.delta === 0) continue;
    if (!worst || cls.delta < worst.delta) {
      worst = { providerId: r.providerId, delta: cls.delta, reason: cls.reason };
    }
  }
  if (!worst) return 0;
  breakdown.push(worst);
  return worst.delta;
}

function classifyTrademark(r: ProviderResult): { delta: number; reason: string } {
  const detail = r.detail ?? "";
  if (r.status === "taken") {
    if (matchesTargetClass(detail)) {
      return {
        delta: -40,
        reason: `${r.providerName}: exact-class trademark hit (IC 9/41)`,
      };
    }
    return { delta: -20, reason: `${r.providerName}: exact trademark hit` };
  }
  if (r.status === "partial") {
    if (/exact-match/i.test(detail) && /outside/i.test(detail)) {
      return {
        delta: -20,
        reason: `${r.providerName}: exact mark outside target class`,
      };
    }
    return { delta: -10, reason: `${r.providerName}: similar trademark hit` };
  }
  return { delta: 0, reason: "" };
}

function matchesTargetClass(detail: string): boolean {
  return /\bIC ?0*(9|41)\b|\bNice ?9\/?41\b|\bNice ?0*(9|41)\b/i.test(detail);
}

function scoreDomain(
  results: ProviderResult[],
  breakdown: ScoreBreakdownEntry[],
): number {
  let total = 0;
  for (const r of results) {
    if (r.status !== "taken") continue;
    const tld = r.providerId.replace(/^domain-/, "");
    let delta = 0;
    if (tld === "com") delta = -25;
    else if (PRIMARY_BRAND_TLDS.has(tld)) delta = -8;
    else if (OFF_BRAND_TLDS.has(tld)) delta = -2;
    else continue;
    breakdown.push({
      providerId: r.providerId,
      delta,
      reason: `.${tld} taken`,
    });
    total += delta;
  }
  return total;
}

function scoreSocial(
  results: ProviderResult[],
  breakdown: ScoreBreakdownEntry[],
): number {
  let total = 0;
  const bigEntries: ScoreBreakdownEntry[] = [];
  let bigPenalty = 0;
  for (const r of results) {
    if (r.status !== "taken") continue;
    if (SOCIAL_BIG.has(r.providerId)) {
      bigEntries.push({
        providerId: r.providerId,
        delta: -3,
        reason: `${r.providerName} taken`,
      });
      bigPenalty -= 3;
    } else if (r.providerId === "github-user") {
      breakdown.push({
        providerId: r.providerId,
        delta: -8,
        reason: "GitHub user taken",
      });
      total -= 8;
    } else if (r.providerId === "bluesky") {
      breakdown.push({
        providerId: r.providerId,
        delta: -5,
        reason: "Bluesky handle taken",
      });
      total -= 5;
    }
  }
  if (bigPenalty < SOCIAL_BIG_CAP) {
    breakdown.push({
      providerId: "social-cap",
      delta: SOCIAL_BIG_CAP,
      reason: `${bigEntries.length} major social handles taken (capped at ${SOCIAL_BIG_CAP})`,
    });
    total += SOCIAL_BIG_CAP;
  } else {
    for (const e of bigEntries) breakdown.push(e);
    total += bigPenalty;
  }
  return total;
}

function scorePackage(
  results: ProviderResult[],
  breakdown: ScoreBreakdownEntry[],
): number {
  let total = 0;
  for (const r of results) {
    if (r.status !== "taken") continue;
    let delta = 0;
    if (r.providerId === "npm") delta = -10;
    else if (
      r.providerId === "pypi" ||
      r.providerId === "crates" ||
      r.providerId === "rubygems" ||
      r.providerId === "maven"
    )
      delta = -4;
    else continue;
    breakdown.push({
      providerId: r.providerId,
      delta,
      reason: `${r.providerName} taken`,
    });
    total += delta;
  }
  return total;
}

function scoreAppstore(
  results: ProviderResult[],
  breakdown: ScoreBreakdownEntry[],
): number {
  let total = 0;
  for (const r of results) {
    if (r.providerId !== "apple-appstore" && r.providerId !== "google-play")
      continue;
    let delta = 0;
    let reason = "";
    if (r.status === "taken") {
      delta = -10;
      reason = `${r.providerName} exact-name app`;
    } else if (r.status === "partial") {
      delta = -3;
      reason = `${r.providerName} similar app`;
    } else continue;
    breakdown.push({ providerId: r.providerId, delta, reason });
    total += delta;
  }
  return total;
}

function scoreCode(
  results: ProviderResult[],
  breakdown: ScoreBreakdownEntry[],
): number {
  let total = 0;
  for (const r of results) {
    if (r.providerId !== "github-repo-search" || r.status !== "taken") continue;
    const stars = extractTopStars(r);
    const delta = stars >= 100 ? -8 : -3;
    breakdown.push({
      providerId: r.providerId,
      delta,
      reason: `GitHub repo exact match (★${stars})`,
    });
    total += delta;
  }
  return total;
}

function extractTopStars(r: ProviderResult): number {
  if (!r.evidence) return 0;
  let max = 0;
  for (const e of r.evidence) {
    const m = /★(\d+)/.exec(e.title);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

function applyBonuses(
  byCategory: Record<ProviderCategory, ProviderResult[]>,
  breakdown: ScoreBreakdownEntry[],
): number {
  let bonus = 0;
  const com = byCategory.domain.find((r) => r.providerId === "domain-com");
  if (com?.status === "available") {
    breakdown.push({ providerId: "domain-com", delta: +10, reason: ".com available" });
    bonus += 10;
  }
  const npm = byCategory.package.find((r) => r.providerId === "npm");
  const gh = byCategory.social.find((r) => r.providerId === "github-user");
  if (npm?.status === "available" && gh?.status === "available") {
    breakdown.push({
      providerId: "npm+github-user",
      delta: +5,
      reason: "npm and GitHub user both available",
    });
    bonus += 5;
  }
  const tm = byCategory.trademark;
  if (tm.length > 0 && tm.every((r) => r.status === "available")) {
    breakdown.push({
      providerId: "trademark-clear",
      delta: +10,
      reason: "all trademark sources clear",
    });
    bonus += 10;
  }
  return bonus;
}

function subverdictFor(results: ProviderResult[], delta: number): Subverdict {
  if (results.length === 0) return "clear";
  const hasNegative = results.some(
    (r) => r.status === "taken" || r.status === "partial",
  );
  if (hasNegative) return delta < -10 ? "blocked" : "caution";
  const allAvailable = results.every((r) => r.status === "available");
  if (allAvailable) return "clear";
  return "caution";
}
