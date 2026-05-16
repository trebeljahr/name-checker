import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ManageBillingButton } from "@/components/ManageBillingButton";
import { getServerSession } from "@/lib/session";
import { getUserPlan } from "@/lib/plan";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Account",
};

export default async function AccountPage(): Promise<React.ReactElement> {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const plan = getUserPlan(session.user.id);
  const isPro = plan === "pro";

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 pt-6">
        <Link
          href="/"
          className="font-mono text-sm font-semibold text-foreground"
        >
          name-check
        </Link>
        <ThemeToggle />
      </div>

      <section className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Account
        </h1>

        <div className="mt-8 rounded-xl border border-border bg-card/60 p-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Signed in as
          </div>
          <div className="mt-1 text-lg font-medium text-foreground">
            {session.user.email}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card/60 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Plan
              </div>
              <div className="mt-1 text-lg font-medium text-foreground">
                {isPro ? "Pro — unlimited bulk" : "Free"}
              </div>
              {!isPro && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Free includes up to 5 names per bulk request, 10 runs per
                  day.
                </p>
              )}
            </div>
            {isPro ? (
              <ManageBillingButton />
            ) : (
              <Link
                href="/pricing"
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Upgrade to Pro
              </Link>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
