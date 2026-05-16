import Link from "next/link";
import { CompareForm } from "@/components/CompareForm";
import { ThemeToggle } from "@/components/ThemeToggle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Compare names — name-check",
  description:
    "Compare up to 10 candidate names side by side across trademarks, domains, socials, app stores, and package registries.",
};

function parseQueries(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  const joined = Array.isArray(raw) ? raw.join(",") : raw;
  return joined
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 10);
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ names?: string | string[] }>;
}): Promise<React.ReactElement> {
  const params = await searchParams;
  const queries = parseQueries(params.names);

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
      <CompareForm initialQueries={queries} />
    </main>
  );
}
