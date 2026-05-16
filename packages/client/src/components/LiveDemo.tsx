"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X, AlertTriangle, Loader2 } from "lucide-react";

type DemoStatus = "available" | "taken" | "verify";

type DemoResult = {
  category: string;
  provider: string;
  status: DemoStatus;
  detail: string;
};

const SCRIPT: DemoResult[] = [
  { category: "Trademarks", provider: "USPTO TESS", status: "available", detail: "No live US trademark match." },
  { category: "Trademarks", provider: "EUIPO (TMview)", status: "available", detail: "No EU registration found." },
  { category: "Domains", provider: ".com", status: "taken", detail: "kairosprotocol.com registered (RDAP 200)." },
  { category: "Domains", provider: ".io", status: "available", detail: "kairosprotocol.io not registered." },
  { category: "Domains", provider: ".dev", status: "available", detail: "kairosprotocol.dev not registered." },
  { category: "Domains", provider: ".ai", status: "taken", detail: "kairosprotocol.ai registered." },
  { category: "Social", provider: "GitHub", status: "available", detail: "Username free." },
  { category: "Social", provider: "X (Twitter)", status: "verify", detail: "Profile-page check — verify manually." },
  { category: "Social", provider: "Bluesky", status: "available", detail: "Handle free." },
  { category: "Social", provider: "itch.io", status: "taken", detail: "Profile exists." },
  { category: "App stores", provider: "Steam", status: "verify", detail: "Search returned matches — verify." },
  { category: "Packages", provider: "npm", status: "available", detail: "Package name free on npm registry." },
  { category: "Packages", provider: "PyPI", status: "available", detail: "Project name free on PyPI." },
  { category: "Code", provider: "GitHub repos", status: "taken", detail: "3 repositories found." },
];

const STATUS_STYLE: Record<
  DemoStatus,
  { label: string; cls: string; Icon: typeof Check }
> = {
  available: {
    label: "AVAILABLE",
    cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    Icon: Check,
  },
  taken: {
    label: "TAKEN",
    cls: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    Icon: X,
  },
  verify: {
    label: "VERIFY",
    cls: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    Icon: AlertTriangle,
  },
};

export function LiveDemo(): React.ReactElement {
  const [shown, setShown] = useState<DemoResult[]>([]);
  const [running, setRunning] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let i = 0;
    setShown([]);
    setRunning(true);

    function tick(): void {
      if (cancelled) return;
      if (i >= SCRIPT.length) {
        setRunning(false);
        restartTimerRef.current = setTimeout(() => {
          if (!cancelled) {
            i = 0;
            setShown([]);
            setRunning(true);
            tick();
          }
        }, 3500);
        return;
      }
      const item = SCRIPT[i]!;
      i++;
      setShown((prev) => [...prev, item]);
      const delay = 140 + Math.random() * 260;
      restartTimerRef.current = setTimeout(tick, delay);
    }

    tick();

    return () => {
      cancelled = true;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    };
  }, []);

  const total = SCRIPT.length;
  const done = shown.length;
  const taken = shown.filter((r) => r.status === "taken").length;
  const available = shown.filter((r) => r.status === "available").length;
  const verify = shown.filter((r) => r.status === "verify").length;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/10 dark:shadow-black/40">
      {/* Faux window chrome */}
      <div className="flex items-center justify-between border-b border-border bg-muted/60 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          name-check · <span className="text-foreground/80">kairosprotocol</span>
        </div>
        <div className="w-12" />
      </div>

      {/* Status strip */}
      <div className="flex items-center justify-between gap-4 border-b border-border bg-muted/30 px-4 py-3 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/70" />
              <span>
                Streaming results · <span className="text-foreground">{done}</span>
                <span className="text-muted-foreground/60">/{total}</span>
              </span>
            </>
          ) : (
            <span className="text-foreground/80">Done · {done} providers checked</span>
          )}
        </div>
        <div className="hidden gap-3 font-mono text-[10px] uppercase tracking-wider sm:flex">
          <span className="text-emerald-600 dark:text-emerald-400">avail {available}</span>
          <span className="text-rose-600 dark:text-rose-400">taken {taken}</span>
          <span className="text-amber-600 dark:text-amber-400">verify {verify}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 w-full bg-muted">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 via-sky-500 to-rose-500 transition-all duration-300"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>

      {/* Results list */}
      <div
        ref={containerRef}
        className="max-h-[420px] divide-y divide-border overflow-hidden"
      >
        {shown.map((r, idx) => {
          const s = STATUS_STYLE[r.status];
          const Icon = s.Icon;
          return (
            <div
              key={`${r.provider}-${idx}`}
              className="flex animate-[slideIn_300ms_ease-out] items-center gap-3 px-4 py-2.5"
              style={{ animationFillMode: "both" }}
            >
              <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${s.cls}`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
              <div className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:w-24">
                {r.category}
              </div>
              <div className="w-28 shrink-0 truncate font-medium text-foreground sm:w-36">
                {r.provider}
              </div>
              <div className="hidden flex-1 truncate text-xs text-muted-foreground md:block">
                {r.detail}
              </div>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ring-1 ring-inset ${s.cls}`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
        {shown.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Connecting to providers…
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
