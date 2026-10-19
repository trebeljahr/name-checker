"use client";

import "@/styles/globals.css";
import { ErrorView } from "@/components/ErrorView";

// Replaces the root layout when the layout itself fails, so it renders its
// own <html> and <body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        <ErrorView error={error} reset={reset} boundary="global" />
      </body>
    </html>
  );
}
