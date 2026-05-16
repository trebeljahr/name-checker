import { CheckForm } from "@/components/CheckForm";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata = {
  title: "Check a name",
  description:
    "Check name availability across trademarks, domains, socials, and more.",
};

export default function CheckPage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          name-check
        </h1>
        <ThemeToggle />
      </div>
      <CheckForm />
    </main>
  );
}
