import type { ProviderResult } from "../types.js";
import type { WatchDiff } from "./diff.js";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export function buildDiffEmail(
  query: string,
  diff: WatchDiff,
): EmailMessage | null {
  const total = diff.gained.length + diff.lost.length;
  if (total === 0) return null;
  const subject = `[name-check] ${query}: ${total} slot${total === 1 ? "" : "s"} changed`;
  const text = renderMarkdown(query, diff);
  return { to: "", subject, text };
}

function renderProvider(r: ProviderResult, sign: "🟢" | "🔴"): string {
  const where = r.verifyUrl ? ` — ${r.verifyUrl}` : "";
  const detail = r.detail ? ` ${r.detail}` : "";
  return `- ${sign} ${r.providerName} (${r.providerId})${detail}${where}`;
}

export function renderMarkdown(query: string, diff: WatchDiff): string {
  const total = diff.gained.length + diff.lost.length;
  const lines: string[] = [];
  lines.push(`## ${query} — ${total} slot${total === 1 ? "" : "s"} changed since yesterday`);
  lines.push("");
  if (diff.gained.length > 0) {
    lines.push("**Gained availability:**");
    for (const r of diff.gained) lines.push(renderProvider(r, "🟢"));
    lines.push("");
  }
  if (diff.lost.length > 0) {
    lines.push("**Lost availability:**");
    for (const r of diff.lost) lines.push(renderProvider(r, "🔴"));
    lines.push("");
  }
  return lines.join("\n");
}
