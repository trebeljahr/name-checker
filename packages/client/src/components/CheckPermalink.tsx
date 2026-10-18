"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckForm } from "@/components/CheckForm";
import { LogoMark } from "@/components/LogoMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WatchButton } from "@/components/WatchButton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { pathParam } from "@/lib/path-param";

export function CheckPermalink(): React.ReactElement {
  // Read after mount: the prerendered shell does not know the name.
  const [query, setQuery] = useState<string | null>(null);
  useEffect(() => {
    setQuery(pathParam(window.location.pathname, "check"));
  }, []);
  useDocumentTitle(query ? `${query} — name check | Name Checker` : null);

  // No SSR runCheck — CheckForm auto-fetches via /api/check?stream=1 on mount.
  // Results stream client-side instead of blocking the page on 50+ provider
  // fetches whose slowest tail dictates page latency.
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <LogoMark className="h-7 w-7" />
          name-check
        </h1>
        <div className="flex items-center gap-3">
          <Link
            href="/watch"
            className="text-xs font-mono text-muted-foreground hover:text-foreground"
          >
            /watch
          </Link>
          {query ? <WatchButton query={query} /> : null}
          <ThemeToggle />
        </div>
      </div>
      {query !== null ? <CheckForm initialQuery={query} autoRun={query !== ""} /> : null}
    </main>
  );
}
