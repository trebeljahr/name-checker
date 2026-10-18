import Link from "next/link";
import { Suspense } from "react";
import { CompareFromQuery } from "@/components/CompareFromQuery";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata = {
  title: "Compare names — name-check",
  description:
    "Compare up to 10 candidate names side by side across trademarks, domains, socials, app stores, and package registries.",
};

export default function ComparePage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 pt-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-2xl font-bold tracking-tight text-foreground hover:opacity-80"
          >
            name-check
          </Link>
          <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono uppercase tracking-wider text-muted-foreground">
            compare
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/check"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Single check →
          </Link>
          <ThemeToggle />
        </div>
      </div>
      {/* `?names=` is read in the browser; the static page renders the form
          without it first. */}
      <Suspense fallback={null}>
        <CompareFromQuery />
      </Suspense>
    </main>
  );
}
