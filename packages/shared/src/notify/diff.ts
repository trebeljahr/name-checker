import type { CheckStatus, CheckSummary, ProviderResult } from "../types.js";

export type WatchDiff = {
  gained: ProviderResult[];
  lost: ProviderResult[];
};

const TAKEN_STATUSES: ReadonlySet<CheckStatus> = new Set([
  "taken",
  "partial",
]);

function isAvailable(s: CheckStatus): boolean {
  return s === "available";
}

function isTaken(s: CheckStatus): boolean {
  return TAKEN_STATUSES.has(s);
}

export function diffSummaries(
  prev: CheckSummary | null | undefined,
  next: CheckSummary,
): WatchDiff {
  const gained: ProviderResult[] = [];
  const lost: ProviderResult[] = [];
  if (!prev) return { gained, lost };

  const prevByProvider = new Map<string, ProviderResult>();
  for (const r of prev.results) prevByProvider.set(r.providerId, r);

  for (const r of next.results) {
    const before = prevByProvider.get(r.providerId);
    if (!before) continue;
    if (!isAvailable(before.status) && isAvailable(r.status)) gained.push(r);
    else if (isAvailable(before.status) && isTaken(r.status)) lost.push(r);
  }
  return { gained, lost };
}

export function hasMeaningfulChange(diff: WatchDiff): boolean {
  return diff.gained.length > 0 || diff.lost.length > 0;
}
