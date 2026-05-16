import type { Provider, ProviderCheckOutput } from "../types.js";
import { encode, fetchWithTimeout } from "../http.js";

const apple: Provider = {
  id: "apple-appstore",
  name: "Apple App Store",
  category: "appstore",
  description: "iTunes Search API across iOS/macOS apps.",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const verifyUrl = `https://www.apple.com/us/search/${encode(query)}?src=globalnav`;
    try {
      const res = await fetchWithTimeout(
        `https://itunes.apple.com/search?term=${encode(query)}&entity=software&limit=10&country=US`,
        { signal, timeoutMs: 8000, headers: { accept: "application/json" } },
      );
      if (!res.ok)
        return { status: "manual_verify", verifyUrl, detail: `iTunes search ${res.status}.` };
      const data = (await res.json()) as {
        resultCount: number;
        results: Array<{ trackName: string; sellerName: string; trackViewUrl: string }>;
      };
      if (data.resultCount === 0)
        return { status: "available", verifyUrl, detail: "No iOS/macOS apps named like this." };
      const exact = data.results.filter(
        (r) => r.trackName.trim().toLowerCase() === query.trim().toLowerCase(),
      );
      const evidence = data.results.slice(0, 5).map((r) => ({
        title: `${r.trackName} — ${r.sellerName}`,
        url: r.trackViewUrl,
      }));
      if (exact.length > 0)
        return {
          status: "taken",
          verifyUrl,
          detail: `${exact.length} exact-name app(s) on Apple.`,
          evidence,
        };
      return {
        status: "partial",
        verifyUrl,
        detail: `${data.resultCount} similar Apple apps but no exact match.`,
        evidence,
      };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `iTunes search failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
  },
};

const googlePlay: Provider = {
  id: "google-play",
  name: "Google Play Store",
  category: "appstore",
  description: "Search Google Play — no official API; manual verify.",
  async check(query): Promise<ProviderCheckOutput> {
    return {
      status: "manual_verify",
      verifyUrl: `https://play.google.com/store/search?q=${encode(query)}&c=apps`,
      detail: "Google Play has no public search API; open link to verify.",
    };
  },
};

const msStore: Provider = {
  id: "ms-store",
  name: "Microsoft Store",
  category: "appstore",
  async check(query): Promise<ProviderCheckOutput> {
    return {
      status: "manual_verify",
      verifyUrl: `https://apps.microsoft.com/search?query=${encode(query)}`,
      detail: "Open link to verify Microsoft Store apps.",
    };
  },
};

const steamStore: Provider = {
  id: "steam-store",
  name: "Steam store (game search)",
  category: "appstore",
  async check(query): Promise<ProviderCheckOutput> {
    return {
      status: "manual_verify",
      verifyUrl: `https://store.steampowered.com/search/?term=${encode(query)}`,
      detail: "Open Steam search to look for existing games with this name.",
    };
  },
};

const itchGames: Provider = {
  id: "itchio-games",
  name: "itch.io (game search)",
  category: "appstore",
  async check(query): Promise<ProviderCheckOutput> {
    return {
      status: "manual_verify",
      verifyUrl: `https://itch.io/search?q=${encode(query)}`,
      detail: "itch.io often 403s automated fetches; verify by hand.",
    };
  },
};

export const appstoreProviders: Provider[] = [
  apple,
  googlePlay,
  msStore,
  steamStore,
  itchGames,
];
