import Link from "next/link";
import { CheckForm } from "@/components/CheckForm";
import { LogoMark } from "@/components/LogoMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WatchButton } from "@/components/WatchButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ query: string }>;
}): Promise<{ title: string; description: string }> {
  const { query } = await params;
  const decoded = decodeURIComponent(query);
  return {
    title: `${decoded} — name check`,
    description: `Name availability check for "${decoded}" across trademarks, domains, socials, app stores, package registries, and code hosts.`,
  };
}

export default async function CheckPermalinkPage({
  params,
}: {
  params: Promise<{ query: string }>;
}): Promise<React.ReactElement> {
  const { query: raw } = await params;
  const query = decodeURIComponent(raw);

  // No SSR runCheck — CheckForm auto-fetches via /api/check?stream=1 on mount.
  // Keeps TTFB instant; results stream client-side instead of blocking the
  // page on 50+ provider fetches whose slowest tail dictates page latency.
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
          <WatchButton query={query} />
          <ThemeToggle />
        </div>
      </div>
      <CheckForm initialQuery={query} autoRun />
    </main>
  );
}
