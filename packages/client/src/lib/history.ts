export const RECENT_STORAGE_KEY = "name-check:recent";
const CAP = 8;

export function getRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, CAP);
  } catch {
    return [];
  }
}

export function pushRecent(q: string): void {
  if (typeof window === "undefined") return;
  const trimmed = q.trim();
  if (!trimmed) return;
  const current = getRecent();
  const next = [
    trimmed,
    ...current.filter((x) => x.toLowerCase() !== trimmed.toLowerCase()),
  ].slice(0, CAP);
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
}
