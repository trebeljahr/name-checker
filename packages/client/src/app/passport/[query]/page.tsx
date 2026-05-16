import Link from "next/link";
import { Passport } from "@/components/Passport";
import { ThemeToggle } from "@/components/ThemeToggle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ query: string }>;
}): Promise<{ title: string; description: string }> {
  const { query } = await params;
  const decoded = decodeURIComponent(query);
  return {
    title: `${decoded} — brand passport`,
    description: `Reserve "${decoded}" across GitHub, npm, and Bluesky in one flow.`,
  };
}

export default async function PassportPage({
  params,
}: {
  params: Promise<{ query: string }>;
}): Promise<React.ReactElement> {
  const { query: raw } = await params;
  const query = decodeURIComponent(raw);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          <Link href="/" className="hover:underline">
            name-check
          </Link>
        </h1>
        <div className="flex items-center gap-3">
          <Link
            href={`/check/${encodeURIComponent(query)}`}
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            ← back to check
          </Link>
          <ThemeToggle />
        </div>
      </div>
      <Passport query={query} />
    </main>
  );
}
