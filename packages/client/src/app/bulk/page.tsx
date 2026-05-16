import Link from "next/link";
import { BulkForm } from "@/components/BulkForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";

export const metadata = {
  title: "Bulk name check",
  description:
    "Check dozens of name candidates at once across trademarks, domains, socials, app stores, and package registries.",
};

export default function BulkPage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← name-check
            </Link>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
              Bulk check
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste up to 100 names — get a matrix of trademarks, domains, socials,
              app stores, packages, and code hosts at a glance.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/check"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Single check
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Pricing
            </Link>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <BulkForm />
      </div>
    </main>
  );
}
