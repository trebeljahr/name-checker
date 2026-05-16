import Link from "next/link";

export default function LandingPage(): React.ReactElement {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-8 text-zinc-100">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="mb-3 text-4xl font-bold tracking-tight">name-check</h1>
        <p className="mb-8 text-lg text-zinc-400">
          One search across trademarks, domains, socials, app stores, package registries, and code hosts.
        </p>
        <Link
          href="/check"
          className="inline-block rounded-md bg-zinc-100 px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white"
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
            <div key={title} className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="font-semibold text-zinc-200">{title}</div>
              <div className="mt-1 text-xs text-zinc-500">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
