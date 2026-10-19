"use client";

import { useEffect } from "react";
import { startErrorReporting } from "@/lib/error-reporting/reporter";

/**
 * Starts error reporting after mount, in builds with `NEXT_PUBLIC_SENTRY_DSN`
 * (see `lib/error-reporting/reporter.ts`). Renders nothing, so the exported
 * HTML is the same with and without it.
 *
 * Mounted in the root layout so the SDK's global handlers see errors
 * outside React too. The error boundaries do not depend on it:
 * `app/global-error.tsx` replaces the root layout and unmounts this, so a
 * boundary's report starts the SDK itself if it is not running yet.
 */
export function ErrorReporting(): null {
  useEffect(() => {
    void startErrorReporting();
  }, []);
  return null;
}
