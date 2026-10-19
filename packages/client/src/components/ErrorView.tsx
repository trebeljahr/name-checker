"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/error-reporting/reporter";

/**
 * The body of app/error.tsx and app/global-error.tsx. Reports the error it
 * shows (a no-op in a build without a DSN) and offers a retry and a reload.
 */
export function ErrorView({
  error,
  reset,
  boundary,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** Which boundary rendered this, for the report's `source` tag. */
  boundary: "boundary" | "global";
}): React.ReactElement {
  useEffect(() => {
    reportClientError(error, { source: boundary });
  }, [error, boundary]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="w-full max-w-md space-y-6" data-testid="error-view" role="alert">
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Something went wrong
          </h1>
          <p className="leading-relaxed text-muted-foreground">
            This page hit an error. Try again, or reload the page.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            data-testid="error-view-retry"
            onClick={reset}
            className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <button
            type="button"
            data-testid="error-view-reload"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center rounded-md border border-border px-5 text-sm font-medium text-foreground hover:bg-accent"
          >
            Reload
          </button>
        </div>
      </div>
    </main>
  );
}
