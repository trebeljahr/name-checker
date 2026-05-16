import { CheckForm } from "@/components/CheckForm";

export const metadata = {
  title: "Check a name",
  description: "Check name availability across trademarks, domains, socials, and more.",
};

export default function CheckPage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-zinc-950">
      <CheckForm />
    </main>
  );
}
