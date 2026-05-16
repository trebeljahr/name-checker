import Link from "next/link";
import { Check } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UpgradeButton } from "@/components/UpgradeButton";
import {
  FREE_NAMES_PER_REQUEST,
  FREE_RUNS_PER_DAY,
} from "@/lib/plan-constants";

export const metadata = {
  title: "Pricing",
  description: "Free or Pro. $5/month for unlimited bulk name checks.",
};

const FREE_FEATURES = [
  `Up to ${FREE_NAMES_PER_REQUEST} names per bulk request`,
  `${FREE_RUNS_PER_DAY} bulk runs per day`,
  "Single-name search unlimited",
  "All 50+ providers (trademarks, domains, socials, app stores, packages)",
];

const PRO_FEATURES = [
  "Unlimited names per bulk request",
  "Unlimited bulk runs",
  "Single-name search unlimited",
  "All 50+ providers",
  "Cancel any time",
];

export default function PricingPage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 pt-6">
        <Link
          href="/"
          className="font-mono text-sm font-semibold text-foreground"
        >
          name-check
        </Link>
        <ThemeToggle />
      </div>

      <section className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          One name, every source. Free to try.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Single-name search is always free and unlimited. Pay only when you
          need to run a bulk shortlist through every provider.
        </p>
      </section>

      <section className="mx-auto mb-20 grid max-w-4xl gap-6 px-6 sm:grid-cols-2">
        <PlanCard
          name="Free"
          price="$0"
          tagline="For solo founders kicking tires."
          features={FREE_FEATURES}
          cta={
            <Link
              href="/check"
              className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Open the app
            </Link>
          }
        />
        <PlanCard
          name="Pro"
          price="$5"
          priceSuffix="/mo"
          tagline="For naming a real product."
          features={PRO_FEATURES}
          highlighted
          cta={<UpgradeButton label="Start Pro — $5/mo" />}
        />
      </section>
    </main>
  );
}

function PlanCard({
  name,
  price,
  priceSuffix,
  tagline,
  features,
  cta,
  highlighted,
}: {
  name: string;
  price: string;
  priceSuffix?: string;
  tagline: string;
  features: string[];
  cta: React.ReactNode;
  highlighted?: boolean;
}): React.ReactElement {
  return (
    <div
      className={
        "flex flex-col rounded-2xl border bg-card/60 p-8 " +
        (highlighted
          ? "border-emerald-500/40 ring-1 ring-emerald-500/30"
          : "border-border")
      }
    >
      <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {name}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-5xl font-bold tracking-tight text-foreground">
          {price}
        </span>
        {priceSuffix && (
          <span className="text-sm text-muted-foreground">{priceSuffix}</span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>
      <ul className="mt-6 flex-1 space-y-2 text-sm text-foreground">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500 dark:text-emerald-400" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8">{cta}</div>
    </div>
  );
}
