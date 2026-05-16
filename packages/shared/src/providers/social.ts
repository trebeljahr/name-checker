import type { Provider, ProviderCheckOutput } from "../types.js";
import { encode, fetchWithTimeout } from "../http.js";
import { domainLabel, handle } from "../normalize.js";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36";

type ProbeOpts = {
  url: string;
  verifyUrl: string;
  signal?: AbortSignal;
  method?: "GET" | "HEAD";
  takenStatuses?: number[];
  availableStatuses?: number[];
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
  description: "X.com / Twitter handle. Anon endpoints are rate-limited and blank-bodied.",
  async check(query): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://x.com/${h}`;
    return {
      status: "manual_verify",
      verifyUrl,
      detail:
        "X blocks anonymous handle lookups (syndication endpoint returns empty body, profile pages 200 for any input). Verify in a browser.",
    };
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
    try {
      const res = await fetchWithTimeout(verifyUrl, {
        signal,
        timeoutMs: 8000,
        headers: { "user-agent": BROWSER_UA, accept: "text/html,*/*" },
      });
      if (res.status === 404) {
        return { status: "available", verifyUrl, detail: `@${h} returns 404 on TikTok.` };
      }
      if (res.status === 200) {
        const body = await res.text();
        const statusMatch = body.match(/"statusCode"\s*:\s*(\d+)/);
        const code = statusMatch ? Number(statusMatch[1]) : null;
        if (code === 0) {
          return {
            status: "taken",
            verifyUrl,
            detail: `@${h} exists on TikTok (SIGI statusCode=0).`,
            evidence: [{ title: verifyUrl, url: verifyUrl }],
          };
        }
        if (code === 10221 || code === 10222) {
          return {
            status: "available",
            verifyUrl,
            detail: `@${h} not found on TikTok (statusCode=${code}).`,
          };
        }
        return {
          status: "manual_verify",
          verifyUrl,
          detail: `TikTok HTML had no decodable statusCode${code !== null ? ` (got ${code})` : ""}.`,
        };
      }
      return { status: "manual_verify", verifyUrl, detail: `TikTok HTTP ${res.status}.` };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `TikTok probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
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
    try {
      const res = await fetchWithTimeout("https://gql.twitch.tv/gql", {
        method: "POST",
        signal,
        timeoutMs: 8000,
        headers: {
          "Client-ID": "kimne78kx3ncx6brgo4mv6wki5h1ko",
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          query: `{ user(login: "${h.replace(/"/g, "")}") { id displayName } }`,
        }),
      });
      if (res.status !== 200) {
        return { status: "manual_verify", verifyUrl, detail: `Twitch GQL HTTP ${res.status}.` };
      }
      const data = (await res.json().catch(() => null)) as
        | { data?: { user?: { id?: string; displayName?: string } | null } }
        | null;
      const user = data?.data?.user;
      if (user && user.id) {
        return {
          status: "taken",
          verifyUrl,
          detail: `Twitch channel "${user.displayName ?? h}" exists (id ${user.id}).`,
          evidence: [{ title: verifyUrl, url: verifyUrl }],
        };
      }
      if (data && "data" in data && data.data && user === null) {
        return { status: "available", verifyUrl, detail: `Twitch /${h} is free.` };
      }
      return { status: "manual_verify", verifyUrl, detail: "Twitch GQL returned no user field." };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `Twitch GQL probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
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
    try {
      const res = await fetchWithTimeout(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encode(h)}`,
        {
          signal,
          timeoutMs: 8000,
          headers: {
            "user-agent": BROWSER_UA,
            accept: "*/*",
            "X-IG-App-ID": "936619743392459",
            "X-ASBD-ID": "129477",
            "X-Requested-With": "XMLHttpRequest",
            Referer: verifyUrl,
            Origin: "https://www.instagram.com",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
          },
        },
      );
      if (res.status === 404) {
        return { status: "available", verifyUrl, detail: `@${h} returns 404 on Instagram.` };
      }
      if (res.status === 200) {
        const data = (await res.json().catch(() => null)) as
          | { data?: { user?: { id?: string; username?: string } | null } }
          | null;
        const user = data?.data?.user;
        if (user && user.id) {
          return {
            status: "taken",
            verifyUrl,
            detail: `@${user.username ?? h} exists on Instagram (id ${user.id}).`,
            evidence: [{ title: verifyUrl, url: verifyUrl }],
          };
        }
        return {
          status: "available",
          verifyUrl,
          detail: `Instagram returned 200 with no user payload for @${h}.`,
        };
      }
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        return {
          status: "manual_verify",
          verifyUrl,
          detail: `Instagram rate-limited or auth-walled the probe (HTTP ${res.status}).`,
        };
      }
      return { status: "manual_verify", verifyUrl, detail: `Instagram HTTP ${res.status}.` };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `Instagram probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
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
    try {
      const res = await fetchWithTimeout(verifyUrl, {
        signal,
        timeoutMs: 8000,
        headers: { "user-agent": BROWSER_UA, accept: "text/html,*/*" },
      });
      if (res.status === 404) {
        return { status: "available", verifyUrl, detail: `@${h} returns 404 on Threads.` };
      }
      if (res.status !== 200) {
        return { status: "manual_verify", verifyUrl, detail: `Threads HTTP ${res.status}.` };
      }
      const body = await res.text();
      const ogUrl = body.match(/property="og:url"\s+content="([^"]+)"/)?.[1] ?? "";
      const ogTitle = body.match(/property="og:title"\s+content="([^"]+)"/)?.[1] ?? "";
      const handleLower = h.toLowerCase();
      const hitsHandle =
        ogUrl.toLowerCase().includes(`/@${handleLower}`) ||
        ogUrl.toLowerCase().includes(`/%40${handleLower}`) ||
        ogTitle.toLowerCase().includes(`@${handleLower}`) ||
        ogTitle.toLowerCase().includes(`&#064;${handleLower}`);
      const isLoginShell =
        ogUrl.endsWith("/login") || /Threads\s*•?\s*Log in/i.test(ogTitle);
      if (hitsHandle) {
        return {
          status: "taken",
          verifyUrl,
          detail: `@${h} exists on Threads (og:url ${ogUrl || "matched title"}).`,
          evidence: [{ title: verifyUrl, url: verifyUrl }],
        };
      }
      if (isLoginShell) {
        return { status: "available", verifyUrl, detail: `@${h} redirects to Threads login.` };
      }
      return {
        status: "manual_verify",
        verifyUrl,
        detail: "Threads HTML had no decodable og:title/og:url.",
      };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `Threads probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
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
    try {
      const res = await fetchWithTimeout(`${verifyUrl}?xml=1`, {
        signal,
        timeoutMs: 8000,
        headers: { "user-agent": BROWSER_UA, accept: "application/xml,text/xml,*/*" },
      });
      if (res.status === 404) {
        return { status: "available", verifyUrl, detail: `Steam /id/${h} returns 404.` };
      }
      if (res.status !== 200) {
        return { status: "manual_verify", verifyUrl, detail: `Steam HTTP ${res.status}.` };
      }
      const body = await res.text();
      if (/<error>/i.test(body) || /could not be found/i.test(body)) {
        return { status: "available", verifyUrl, detail: `Steam /id/${h} has no profile.` };
      }
      const steamId = body.match(/<steamID64>(\d+)<\/steamID64>/)?.[1];
      if (steamId) {
        return {
          status: "taken",
          verifyUrl,
          detail: `Steam /id/${h} resolves to ${steamId}.`,
          evidence: [{ title: verifyUrl, url: verifyUrl }],
        };
      }
      return { status: "manual_verify", verifyUrl, detail: "Steam XML had no steamID64 or error tag." };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `Steam probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
  },
};

const linkedin: Provider = {
  id: "linkedin-company",
  name: "LinkedIn company page",
  category: "social",
  description: "LinkedIn company slug. Voyager API is auth-walled — no reliable anon check.",
  async check(query): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://www.linkedin.com/company/${h}/`;
    return {
      status: "manual_verify",
      verifyUrl,
      detail:
        "LinkedIn auth-walls /company/<slug> and the Voyager identity API; both 200/redirect for any input. Verify by signing in.",
    };
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

const discordVanity: Provider = {
  id: "discord-vanity",
  name: "Discord vanity invite",
  category: "social",
  description: "discord.gg/<vanity> invite code (a.k.a. server vanity URL).",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid vanity chars." };
    const verifyUrl = `https://discord.com/invite/${h}`;
    try {
      const res = await fetchWithTimeout(
        `https://discord.com/api/v9/invites/${encode(h)}`,
        {
          signal,
          timeoutMs: 8000,
          headers: { accept: "application/json" },
        },
      );
      if (res.status === 200) {
        const data = (await res.json().catch(() => null)) as
          | { code?: string; guild?: { name?: string; id?: string } }
          | null;
        if (data?.code) {
          return {
            status: "taken",
            verifyUrl,
            detail: data.guild?.name
              ? `discord.gg/${h} maps to "${data.guild.name}".`
              : `discord.gg/${h} is an active invite.`,
            evidence: [{ title: verifyUrl, url: verifyUrl }],
          };
        }
        return { status: "manual_verify", verifyUrl, detail: "Discord 200 but no code field." };
      }
      if (res.status === 404) {
        return { status: "available", verifyUrl, detail: `discord.gg/${h} is unclaimed.` };
      }
      return { status: "manual_verify", verifyUrl, detail: `Discord HTTP ${res.status}.` };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `Discord probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
  },
};

const telegram: Provider = {
  id: "telegram",
  name: "Telegram handle (user/channel/bot)",
  category: "social",
  description: "t.me/<handle> — covers users, channels, and bots.",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const h = handle(query);
    if (!h) return { status: "unknown", detail: "No valid handle chars." };
    const verifyUrl = `https://t.me/${h}`;
    try {
      const res = await fetchWithTimeout(verifyUrl, {
        signal,
        timeoutMs: 8000,
        headers: { "user-agent": BROWSER_UA, accept: "text/html,*/*" },
      });
      if (res.status === 404) {
        return { status: "available", verifyUrl, detail: `t.me/${h} returns 404.` };
      }
      if (res.status !== 200) {
        return { status: "manual_verify", verifyUrl, detail: `Telegram HTTP ${res.status}.` };
      }
      const body = await res.text();
      if (body.includes("tgme_page_title")) {
        return {
          status: "taken",
          verifyUrl,
          detail: `t.me/${h} renders a profile page.`,
          evidence: [{ title: verifyUrl, url: verifyUrl }],
        };
      }
      return { status: "available", verifyUrl, detail: `t.me/${h} falls back to default landing.` };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `Telegram probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
  },
};

const emailMx: Provider = {
  id: "email-mx",
  name: "Email infra (MX record on .com)",
  category: "social",
  description: "Cloudflare DoH MX lookup for <name>.com — proxies 'does anyone use this for email'.",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const label = domainLabel(query);
    if (!label) return { status: "unknown", detail: "No valid domain label." };
    const fqdn = `${label}.com`;
    const verifyUrl = `https://www.google.com/search?q=${encode(fqdn)}+email`;
    try {
      const res = await fetchWithTimeout(
        `https://cloudflare-dns.com/dns-query?name=${encode(fqdn)}&type=MX`,
        {
          signal,
          timeoutMs: 8000,
          headers: { accept: "application/dns-json" },
        },
      );
      if (res.status !== 200) {
        return { status: "manual_verify", verifyUrl, detail: `DoH HTTP ${res.status}.` };
      }
      const data = (await res.json().catch(() => null)) as
        | { Status?: number; Answer?: Array<{ type?: number; data?: string }> }
        | null;
      if (!data) {
        return { status: "manual_verify", verifyUrl, detail: "DoH response was not JSON." };
      }
      const mxAnswers = (data.Answer ?? []).filter((a) => a.type === 15);
      if (data.Status === 0 && mxAnswers.length > 0) {
        const sample = mxAnswers[0]?.data ?? "MX present";
        return {
          status: "taken",
          verifyUrl,
          detail: `${fqdn} has ${mxAnswers.length} MX record(s) (e.g. ${sample}).`,
          evidence: [{ title: fqdn, url: `https://${fqdn}` }],
        };
      }
      if (data.Status === 3) {
        return { status: "available", verifyUrl, detail: `${fqdn} NXDOMAIN — no zone, no email.` };
      }
      if (data.Status === 0) {
        return {
          status: "available",
          verifyUrl,
          detail: `${fqdn} resolves but has no MX records.`,
        };
      }
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `DoH Status=${data.Status ?? "?"}, ${mxAnswers.length} MX answer(s).`,
      };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `DoH probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
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
  discordVanity,
  telegram,
  emailMx,
];
