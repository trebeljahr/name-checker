import Link from "next/link";
import { CheckForm } from "@/components/CheckForm";
import { LogoMark } from "@/components/LogoMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";

export const metadata = {
  title: "Check a name",
  description:
    "Check name availability across trademarks, domains, socials, and more.",
};

export default function CheckPage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <LogoMark className="h-7 w-7" />
          name-check
        </h1>
        <div className="flex items-center gap-3">
          <Link
            href="/bulk"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Bulk
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
      <CheckForm />
    </main>
  );
}
