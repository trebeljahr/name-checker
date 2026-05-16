import Link from "next/link";
import {
  Shield,
  Globe,
  AtSign,
  AppWindow,
  Package,
  GitBranch,
  Zap,
  Eye,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { HeroSearch } from "@/components/HeroSearch";
import { LiveDemo } from "@/components/LiveDemo";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata = {
  title: "name-check — Is your name actually available?",
  description:
    "One search across 50+ trademark offices, domain registries, social networks, app stores, and package registries. Real APIs, live results, in seconds.",
};

const CATEGORIES: Array<{
  Icon: typeof Shield;
  title: string;
  count: string;
  desc: string;
  sources: string[];
}> = [
  {
    Icon: Shield,
    title: "Trademarks",
    count: "8 offices",
    desc: "Live registries — not screenshots.",
    sources: ["USPTO", "EUIPO", "DPMA", "WIPO", "UKIPO", "CIPO", "IPAU", "TMview"],
  },
  {
    Icon: Globe,
    title: "Domains",
    count: "18 TLDs",
    desc: "RDAP authoritative lookups.",
    sources: [".com", ".io", ".dev", ".ai", ".app", ".gg", ".game", ".studio", ".xyz", ".co"],
  },
  {
    Icon: AtSign,
    title: "Social handles",
    count: "19 networks",
    desc: "Profile-page probes per network.",
    sources: ["GitHub", "Bluesky", "X", "TikTok", "YouTube", "Twitch", "Reddit", "Instagram", "itch.io"],
  },
  {
    Icon: AppWindow,
    title: "App stores",
    count: "5 stores",
    desc: "Official catalog APIs.",
    sources: ["Apple App Store", "Google Play", "Microsoft Store", "Steam", "itch.io games"],
  },
  {
    Icon: Package,
    title: "Packages",
    count: "5 registries",
    desc: "Public registry endpoints.",
    sources: ["npm", "PyPI", "crates.io", "RubyGems", "Maven Central"],
  },
  {
    Icon: GitBranch,
    title: "Code hosts",
    count: "GitHub",
    desc: "Repo + org name collisions.",
    sources: ["GitHub repo search"],
  },
];

const STEPS = [
  {
    n: "1",
    title: "Type a name",
    desc: "Whatever you're considering for the product, brand, repo, or handle.",
  },
  {
    n: "2",
    title: "Watch results stream in",
    desc: "Every provider runs in parallel. First answers in well under a second.",
  },
  {
    n: "3",
    title: "Open verify links",
    desc: "Every hit deep-links to the source so you can confirm before committing.",
  },
];

export default function LandingPage(): React.ReactElement {
  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Top nav */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/30">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
          </div>
          <span className="font-mono text-sm font-semibold text-foreground">name-check</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="#how"
            className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
          >
            How it works
          </a>
          <a
            href="#sources"
            className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
          >
            Sources
          </a>
          <Link
            href="/bulk"
            className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
          >
            Bulk check
          </Link>
          <Link
            href="/check"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Open app
          </Link>
          <ThemeToggle />
        </div>
      </nav>

      {/* Hero */}
      <section className="relative">
        <BackgroundGlow />
        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 text-center sm:pt-24">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 dark:bg-emerald-400" />
            Live data · 50+ sources · no scraping shortcuts
          </div>

          <h1 className="mx-auto max-w-4xl text-balance text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            Don't ship a name
            <br />
            <span className="bg-gradient-to-r from-emerald-500 via-sky-500 to-violet-500 bg-clip-text text-transparent dark:from-emerald-400 dark:via-sky-400 dark:to-violet-400">
              you'll have to rebrand.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
            One search across trademark offices, domain registries, social networks, app
            stores, and package registries. Real APIs, streamed live — see the truth in
            seconds.
          </p>

          <div className="mx-auto mt-10 max-w-2xl">
            <HeroSearch />
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Try:</span>
              {["kairosprotocol", "lunarcore", "pixeldrift", "fleetview"].map((s) => (
                <Link
                  key={s}
                  href={`/check/${encodeURIComponent(s)}`}
                  className="font-mono underline-offset-2 hover:text-foreground hover:underline"
                >
                  {s}
                </Link>
              ))}
            </div>
          </div>

          {/* Trust strip */}
          <div className="mx-auto mt-14 flex max-w-4xl flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            {["USPTO", "EUIPO", "TMview", "RDAP", "npm", "PyPI", "GitHub", "App Store", "Google Play", "Steam"].map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Live demo */}
      <section className="relative mx-auto max-w-5xl px-6 pb-24">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-card px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 ring-1 ring-emerald-500/30 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 dark:bg-emerald-400" />
              Live preview
            </div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              This is what you get back.
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Real-time stream — every provider answers as soon as it can.
            </p>
          </div>
        </div>
        <LiveDemo />
      </section>

      {/* Why */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-20 sm:grid-cols-3">
          <Feature
            Icon={Zap}
            title="Real APIs, not guesses"
            body="RDAP for domains, USPTO TESS, EUIPO/TMview, registry APIs, store search endpoints. No screenshot scraping."
          />
          <Feature
            Icon={Eye}
            title="Streamed live"
            body="Every provider runs concurrently. Results appear as they arrive — no long blocking spinner."
          />
          <Feature
            Icon={CheckCircle2}
            title="Verify before you commit"
            body="Every hit deep-links to the source. Hand-check anything that says VERIFY before you spend money."
          />
        </div>
      </section>

      {/* How */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-2 inline-block rounded-full bg-card px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground ring-1 ring-border">
            How it works
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            From doubt to decision in seconds.
          </h2>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="relative rounded-xl border border-border bg-card/50 p-6"
            >
              <div className="absolute -top-3 left-6 rounded-md bg-background px-2 py-0.5 font-mono text-xs font-bold text-emerald-600 ring-1 ring-emerald-500/30 dark:text-emerald-400">
                STEP {s.n}
              </div>
              <h3 className="mt-2 text-lg font-semibold text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sources */}
      <section id="sources" className="border-t border-border bg-background">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-2 inline-block rounded-full bg-card px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground ring-1 ring-border">
              Every place that matters
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              6 categories. 50+ providers. One search.
            </h2>
            <p className="mt-4 text-muted-foreground">
              The places where a name collision actually costs you money, time, or a lawyer.
            </p>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((c) => (
              <div
                key={c.title}
                className="group rounded-xl border border-border bg-card/50 p-5 transition-colors hover:border-foreground/20 hover:bg-card"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/20">
                    <c.Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{c.count}</span>
                </div>
                <h3 className="text-lg font-semibold text-foreground">{c.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {c.sources.map((s) => (
                    <span
                      key={s}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden border-t border-border">
        <BackgroundGlow />
        <div className="relative mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Got a name in mind?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Type it in — see every conflict before you put it on a slide deck, a domain
            invoice, or a tattoo.
          </p>
          <div className="mx-auto mt-10 max-w-2xl">
            <HeroSearch />
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link
              href="/check"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Or open the full app
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/bulk"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Check many names at once
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/30">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
            </div>
            <span className="font-mono text-foreground/80">name-check</span>
            <span className="text-muted-foreground/50">·</span>
            <span>One search. Every place that matters.</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/check" className="hover:text-foreground">
              App
            </Link>
            <Link href="/bulk" className="hover:text-foreground">
              Bulk
            </Link>
            <a href="#sources" className="hover:text-foreground">
              Sources
            </a>
            <a href="#how" className="hover:text-foreground">
              How it works
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Feature({
  Icon,
  title,
  body,
}: {
  Icon: typeof Zap;
  title: string;
  body: string;
}): React.ReactElement {
  return (
    <div>
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-card ring-1 ring-border">
        <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function BackgroundGlow(): React.ReactElement {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-32 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute -top-20 left-1/4 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="absolute -top-20 right-1/4 h-[400px] w-[400px] translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl" />
    </div>
  );
}
