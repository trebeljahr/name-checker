import type { Provider, ProviderCheckOutput } from "../types.js";
import { encode, fetchWithTimeout } from "../http.js";
import { handle } from "../normalize.js";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36";

type ProbeOpts = {
  url: string;
  verifyUrl: string;
  signal?: AbortSignal;
  method?: "GET" | "HEAD";
  takenStatuses?: number[];
  availableStatuses?: number[];
  unreliable?: boolean;
  detailTaken: string;
  detailAvailable: string;
  browserHeaders?: boolean;
};

async function probe(opts: ProbeOpts): Promise<ProviderCheckOutput> {
  const taken = opts.takenStatuses ?? [200];
  const avail = opts.availableStatuses ?? [404];
  const headers: Record<string, string> = opts.browserHeaders
    ? { "user-agent": BROWSER_UA, accept: "text/html,*/*" }
    : {};
  try {
    const res = await fetchWithTimeout(opts.url, {
      method: opts.method ?? "HEAD",
      signal: opts.signal,
      timeoutMs: 8000,
      headers,
      redirect: "manual",
    });
    if (taken.includes(res.status)) {
      if (opts.unreliable) {
        return {
          status: "manual_verify",
          verifyUrl: opts.verifyUrl,
          detail: `Platform returned ${res.status} but blocks reliable checks; verify by hand.`,
        };
      }
      return {
        status: "taken",
        verifyUrl: opts.verifyUrl,
        detail: opts.detailTaken,
        evidence: [{ title: opts.url, url: opts.url }],
      };
    }
    if (avail.includes(res.status)) {
      return {
        status: "available",
        verifyUrl: opts.verifyUrl,
        detail: opts.detailAvailable,
      };
    }
    if (res.status >= 300 && res.status < 400) {
      return {
        status: "taken",
        verifyUrl: opts.verifyUrl,
        detail: `Redirect ${res.status} suggests handle exists.`,
        evidence: [{ title: opts.url, url: opts.url }],
      };
    }
    return {
      status: "manual_verify",
      verifyUrl: opts.verifyUrl,
      detail: `Unexpected ${res.status}; verify manually.`,
    };
  } catch (err) {
    return {
      status: "manual_verify",
      verifyUrl: opts.verifyUrl,
      detail: `Probe failed (${err instanceof Error ? err.message : "unknown"}).`,
    };
  }
}

const bluesky: Provider = {
  id: "bluesky",
  name: "Bluesky handle",
  category: "social",
  description: "Bluesky handle on the default bsky.social domain.",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    const verifyUrl = `https://bsky.app/profile/${h}.bsky.social`;
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    try {
      const res = await fetchWithTimeout(
        `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encode(h)}.bsky.social`,
        { signal, timeoutMs: 8000, headers: { accept: "application/json" } },
      );
      if (res.status === 200) {
        return {
          status: "taken",
          verifyUrl,
          detail: `@${h}.bsky.social resolves on Bluesky.`,
          evidence: [{ title: verifyUrl, url: verifyUrl }],
        };
      }
      if (res.status === 400) {
        return {
          status: "available",
          verifyUrl,
          detail: `@${h}.bsky.social is not registered.`,
        };
      }
      return { status: "manual_verify", verifyUrl, detail: `Got ${res.status}.` };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `Bluesky probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
  },
};

const githubUser: Provider = {
  id: "github-user",
  name: "GitHub user/org",
  category: "social",
  description:
    "GitHub username (single namespace covers personal + organization accounts).",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    const verifyUrl = `https://github.com/${h}`;
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    try {
      const res = await fetchWithTimeout(`https://api.github.com/users/${encode(h)}`, {
        signal,
        timeoutMs: 8000,
        headers: { accept: "application/vnd.github+json" },
      });
      if (res.status === 200) {
        return {
          status: "taken",
          verifyUrl,
          detail: `github.com/${h} exists.`,
          evidence: [{ title: verifyUrl, url: verifyUrl }],
        };
      }
      if (res.status === 404) {
        return {
          status: "available",
          verifyUrl,
          detail: `github.com/${h} is free.`,
        };
      }
      if (res.status === 403) {
        return {
          status: "unknown",
          verifyUrl,
          detail: "GitHub API rate-limit (anonymous).",
        };
      }
      return { status: "manual_verify", verifyUrl, detail: `Got ${res.status}.` };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `GitHub probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
  },
};

const x: Provider = {
  id: "x",
  name: "X / Twitter handle",
  category: "social",
  description: "X.com / Twitter handle (often unreliable due to anti-bot).",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://x.com/${h}`;
    return probe({
      url: verifyUrl,
      verifyUrl,
      signal,
      method: "GET",
      browserHeaders: true,
      unreliable: true,
      detailTaken: "x.com responded but X often returns 200 even for missing handles.",
      detailAvailable: "x.com returned 404.",
    });
  },
};

const tiktok: Provider = {
  id: "tiktok",
  name: "TikTok handle",
  category: "social",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://www.tiktok.com/@${h}`;
    return probe({
      url: verifyUrl,
      verifyUrl,
      signal,
      method: "GET",
      browserHeaders: true,
      unreliable: true,
      detailTaken: "TikTok responded; manual check recommended.",
      detailAvailable: "TikTok returned 404.",
    });
  },
};

const youtube: Provider = {
  id: "youtube",
  name: "YouTube handle",
  category: "social",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://www.youtube.com/@${h}`;
    return probe({
      url: verifyUrl,
      verifyUrl,
      signal,
      method: "GET",
      browserHeaders: true,
      detailTaken: `@${h} resolves on YouTube.`,
      detailAvailable: `@${h} returned 404 on YouTube.`,
    });
  },
};

const itchio: Provider = {
  id: "itchio-user",
  name: "itch.io profile",
  category: "social",
  description: "itch.io creator subdomain.",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query).replace(/_/g, "-");
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://${h}.itch.io/`;
    return probe({
      url: verifyUrl,
      verifyUrl,
      signal,
      method: "GET",
      browserHeaders: true,
      detailTaken: `${h}.itch.io exists.`,
      detailAvailable: `${h}.itch.io is free.`,
    });
  },
};

const twitch: Provider = {
  id: "twitch",
  name: "Twitch channel",
  category: "social",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://www.twitch.tv/${h}`;
    return probe({
      url: verifyUrl,
      verifyUrl,
      signal,
      method: "GET",
      browserHeaders: true,
      unreliable: true,
      detailTaken: "Twitch returned 200; manual confirm recommended.",
      detailAvailable: "Twitch returned 404.",
    });
  },
};

const redditUser: Provider = {
  id: "reddit-user",
  name: "Reddit user",
  category: "social",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://www.reddit.com/user/${h}`;
    try {
      const res = await fetchWithTimeout(
        `https://www.reddit.com/user/${encode(h)}/about.json`,
        {
          signal,
          timeoutMs: 8000,
          headers: { "user-agent": BROWSER_UA, accept: "application/json" },
        },
      );
      if (res.status === 200) {
        const data = (await res.json().catch(() => null)) as
          | { data?: { is_suspended?: boolean } }
          | null;
        if (data?.data) {
          return {
            status: "taken",
            verifyUrl,
            detail: `u/${h} exists${data.data.is_suspended ? " (suspended)" : ""}.`,
            evidence: [{ title: verifyUrl, url: verifyUrl }],
          };
        }
      }
      if (res.status === 404) {
        return { status: "available", verifyUrl, detail: `u/${h} is free.` };
      }
      return { status: "manual_verify", verifyUrl, detail: `Got ${res.status}.` };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `Reddit probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
  },
};

const redditSub: Provider = {
  id: "reddit-sub",
  name: "Reddit subreddit",
  category: "social",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://www.reddit.com/r/${h}`;
    try {
      const res = await fetchWithTimeout(
        `https://www.reddit.com/r/${encode(h)}/about.json`,
        {
          signal,
          timeoutMs: 8000,
          headers: { "user-agent": BROWSER_UA, accept: "application/json" },
        },
      );
      if (res.status === 200) {
        const data = (await res.json().catch(() => null)) as
          | { kind?: string; data?: { display_name?: string } }
          | null;
        if (data?.data?.display_name) {
          return {
            status: "taken",
            verifyUrl,
            detail: `r/${h} exists.`,
            evidence: [{ title: verifyUrl, url: verifyUrl }],
          };
        }
        return { status: "available", verifyUrl, detail: `r/${h} unclaimed.` };
      }
      if (res.status === 404) {
        return { status: "available", verifyUrl, detail: `r/${h} unclaimed.` };
      }
      return { status: "manual_verify", verifyUrl, detail: `Got ${res.status}.` };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `Reddit probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
  },
};

const instagram: Provider = {
  id: "instagram",
  name: "Instagram handle",
  category: "social",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://www.instagram.com/${h}/`;
    return probe({
      url: verifyUrl,
      verifyUrl,
      signal,
      method: "GET",
      browserHeaders: true,
      unreliable: true,
      detailTaken: "Instagram responded; verify manually (login wall hides real status).",
      detailAvailable: "Instagram returned 404.",
    });
  },
};

const threads: Provider = {
  id: "threads",
  name: "Threads handle",
  category: "social",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://www.threads.net/@${h}`;
    return probe({
      url: verifyUrl,
      verifyUrl,
      signal,
      method: "GET",
      browserHeaders: true,
      unreliable: true,
      detailTaken: "Threads responded; verify manually.",
      detailAvailable: "Threads returned 404.",
    });
  },
};

const mastodonSocial: Provider = {
  id: "mastodon-social",
  name: "Mastodon (mastodon.social)",
  category: "social",
  description: "Account on the flagship mastodon.social instance.",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://mastodon.social/@${h}`;
    try {
      const res = await fetchWithTimeout(
        `https://mastodon.social/api/v1/accounts/lookup?acct=${encode(h)}`,
        { signal, timeoutMs: 8000, headers: { accept: "application/json" } },
      );
      if (res.status === 200)
        return {
          status: "taken",
          verifyUrl,
          detail: `@${h}@mastodon.social exists.`,
          evidence: [{ title: verifyUrl, url: verifyUrl }],
        };
      if (res.status === 404)
        return { status: "available", verifyUrl, detail: `@${h}@mastodon.social free.` };
      return { status: "manual_verify", verifyUrl, detail: `Got ${res.status}.` };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `Mastodon probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
  },
};

const mastodonGamedev: Provider = {
  id: "mastodon-gamedev",
  name: "Mastodon (mastodon.gamedev.place)",
  category: "social",
  description: "Gamedev-focused Mastodon instance.",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://mastodon.gamedev.place/@${h}`;
    try {
      const res = await fetchWithTimeout(
        `https://mastodon.gamedev.place/api/v1/accounts/lookup?acct=${encode(h)}`,
        { signal, timeoutMs: 8000, headers: { accept: "application/json" } },
      );
      if (res.status === 200) return { status: "taken", verifyUrl };
      if (res.status === 404) return { status: "available", verifyUrl };
      return { status: "manual_verify", verifyUrl, detail: `Got ${res.status}.` };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `Mastodon probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
  },
};

const patreon: Provider = {
  id: "patreon",
  name: "Patreon page",
  category: "social",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://www.patreon.com/${h}`;
    return probe({
      url: verifyUrl,
      verifyUrl,
      signal,
      method: "GET",
      browserHeaders: true,
      detailTaken: `patreon.com/${h} exists.`,
      detailAvailable: `patreon.com/${h} is free.`,
    });
  },
};

const kofi: Provider = {
  id: "kofi",
  name: "Ko-fi page",
  category: "social",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://ko-fi.com/${h}`;
    return probe({
      url: verifyUrl,
      verifyUrl,
      signal,
      method: "GET",
      browserHeaders: true,
      detailTaken: `ko-fi.com/${h} exists.`,
      detailAvailable: `ko-fi.com/${h} is free.`,
    });
  },
};

const substack: Provider = {
  id: "substack",
  name: "Substack publication",
  category: "social",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query).replace(/_/g, "");
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://${h}.substack.com/`;
    return probe({
      url: verifyUrl,
      verifyUrl,
      signal,
      method: "GET",
      browserHeaders: true,
      detailTaken: `${h}.substack.com exists.`,
      detailAvailable: `${h}.substack.com is free.`,
    });
  },
};

const steam: Provider = {
  id: "steam-profile",
  name: "Steam community profile",
  category: "social",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://steamcommunity.com/id/${h}`;
    return probe({
      url: verifyUrl,
      verifyUrl,
      signal,
      method: "GET",
      browserHeaders: true,
      unreliable: true,
      detailTaken: "Steam returned 200; check page content for 'no user'.",
      detailAvailable: "Steam returned 404.",
    });
  },
};

const linkedin: Provider = {
  id: "linkedin-company",
  name: "LinkedIn company page",
  category: "social",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://www.linkedin.com/company/${h}/`;
    return probe({
      url: verifyUrl,
      verifyUrl,
      signal,
      method: "GET",
      browserHeaders: true,
      unreliable: true,
      detailTaken: "LinkedIn responded but auth-walls hide reality.",
      detailAvailable: "LinkedIn returned 404.",
    });
  },
};

const pinterest: Provider = {
  id: "pinterest",
  name: "Pinterest handle",
  category: "social",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://www.pinterest.com/${h}/`;
    return probe({
      url: verifyUrl,
      verifyUrl,
      signal,
      method: "GET",
      browserHeaders: true,
      detailTaken: `pinterest.com/${h} exists.`,
      detailAvailable: `pinterest.com/${h} is free.`,
    });
  },
};

export const socialProviders: Provider[] = [
  bluesky,
  githubUser,
  x,
  tiktok,
  youtube,
  itchio,
  twitch,
  redditUser,
  redditSub,
  instagram,
  threads,
  mastodonSocial,
  mastodonGamedev,
  patreon,
  kofi,
  substack,
  steam,
  linkedin,
  pinterest,
];
