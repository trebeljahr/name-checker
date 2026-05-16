import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function LandingPage(): React.ReactElement {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-background p-8 text-foreground">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="mb-3 text-4xl font-bold tracking-tight">name-check</h1>
        <p className="mb-8 text-lg text-muted-foreground">
          One search across trademarks, domains, socials, app stores, package
          registries, and code hosts.
        </p>
        <Link
          href="/check"
          className="inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Start checking →
        </Link>
        <div className="mt-12 grid grid-cols-2 gap-3 text-left text-sm md:grid-cols-3">
          {[
            ["Trademarks", "USPTO, EUIPO, DPMA, WIPO, UKIPO, CIPO, IPAU + TMview live"],
            ["Domains", "RDAP across 18 TLDs (.com .gg .game .dev .ai .io…)"],
            ["Social", "Bluesky, GitHub, X, TikTok, YouTube, itch.io, Twitch, Reddit, IG…"],
            ["App stores", "Apple, Google Play, MS, Steam, itch.io games"],
            ["Packages", "npm, PyPI, crates.io, RubyGems, Maven"],
            ["Code", "GitHub repo search"],
          ].map(([title, desc]) => (
            <div
              key={title}
              className="rounded-md border border-border bg-card p-3"
            >
              <div className="font-semibold text-foreground">{title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
