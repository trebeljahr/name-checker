"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Passport } from "@/components/Passport";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { pathParam } from "@/lib/path-param";

export function PassportPermalink(): React.ReactElement {
  // Read after mount: the prerendered shell does not know the name.
  const [query, setQuery] = useState<string | null>(null);
  useEffect(() => {
    setQuery(pathParam(window.location.pathname, "passport"));
  }, []);
  useDocumentTitle(query ? `${query} — brand passport | Name Checker` : null);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          <Link href="/" className="hover:underline">
            name-check
          </Link>
        </h1>
        <div className="flex items-center gap-3">
          {query ? (
            <a
              href={`/check/${encodeURIComponent(query)}`}
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              ← back to check
            </a>
          ) : null}
          <ThemeToggle />
        </div>
      </div>
      {query ? <Passport query={query} /> : null}
    </main>
  );
}
