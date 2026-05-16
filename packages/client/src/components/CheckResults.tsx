"use client";

import type {
  CheckStatus,
  ProviderCategory,
  ProviderResult,
} from "@starter/shared";

const STATUS_STYLE: Record<CheckStatus, { label: string; cls: string }> = {
  available: { label: "AVAILABLE", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  taken: { label: "TAKEN", cls: "bg-rose-500/15 text-rose-300 ring-rose-500/30" },
  partial: { label: "PARTIAL", cls: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  manual_verify: { label: "VERIFY", cls: "bg-sky-500/15 text-sky-300 ring-sky-500/30" },
  unknown: { label: "UNKNOWN", cls: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30" },
  error: { label: "ERROR", cls: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30" },
};

const CATEGORY_LABEL: Record<ProviderCategory, string> = {
  trademark: "Trademarks",
  domain: "Domains",
  social: "Social handles",
  appstore: "App stores",
  package: "Package registries",
  code: "Code hosts",
};

export function StatusBadge({ status }: { status: CheckStatus }): React.ReactElement {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-mono font-medium ring-1 ring-inset ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

export function ProviderRow({ r }: { r: ProviderResult }): React.ReactElement {
  return (
    <li className="flex flex-col gap-1 border-b border-zinc-800 px-4 py-3 last:border-0 md:flex-row md:items-start md:gap-4">
      <div className="md:w-24 shrink-0">
        <StatusBadge status={r.status} />
      </div>
      <div className="md:w-56 shrink-0">
        <div className="font-medium text-zinc-100">{r.providerName}</div>
        <div className="font-mono text-xs text-zinc-500">{r.providerId}</div>
      </div>
      <div className="flex-1 text-sm text-zinc-400">
        {r.detail ?? r.error ?? "—"}
        {r.evidence && r.evidence.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-xs text-zinc-500">
            {r.evidence.slice(0, 3).map((e, i) => (
              <li key={i}>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
                >
                  {e.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="md:w-32 shrink-0 text-right">
        {r.verifyUrl ? (
          <a
            href={r.verifyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-xs text-sky-400 underline-offset-2 hover:underline"
          >
            verify ↗
          </a>
        ) : null}
        <div className="font-mono text-xs text-zinc-600">{r.durationMs}ms</div>
      </div>
    </li>
  );
}

export function CategoryGroup({
  category,
  results,
}: {
  category: ProviderCategory;
  results: ProviderResult[];
}): React.ReactElement {
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/50">
      <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
          {CATEGORY_LABEL[category]}
        </h2>
        <span className="font-mono text-xs text-zinc-500">{results.length}</span>
      </header>
      <ul>
        {results.map((r) => (
          <ProviderRow key={r.providerId} r={r} />
        ))}
      </ul>
    </section>
  );
}
