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

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

type PlayHit = { id: string; title: string };

function extractPlayTitles(html: string): PlayHit[] {
  const out: PlayHit[] = [];
  const seen = new Set<string>();
  const push = (id: string, title: string): void => {
    const cleaned = title.trim();
    if (!id || !cleaned || seen.has(id)) return;
    seen.add(id);
    out.push({ id, title: cleaned });
  };

  const rxAria =
    /href="\/store\/apps\/details\?id=([A-Za-z0-9._-]+)"[^>]*aria-label="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = rxAria.exec(html)) !== null) {
    push(m[1]!, decodeHtmlEntities(m[2]!));
  }

  if (out.length === 0) {
    const rxAnchor =
      /<a[^>]+href="\/store\/apps\/details\?id=([A-Za-z0-9._-]+)"[^>]*>([\s\S]{0,600}?)<\/a>/g;
    while ((m = rxAnchor.exec(html)) !== null) {
      const id = m[1]!;
      if (seen.has(id)) continue;
      const inner = m[2]!;
      const spanMatch = /<span[^>]*>([^<]{2,120})<\/span>/.exec(inner);
      if (spanMatch) push(id, decodeHtmlEntities(spanMatch[1]!));
    }
  }

  if (out.length === 0) {
    const rxJsonLd =
      /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
    while ((m = rxJsonLd.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(m[1]!) as unknown;
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item && typeof item === "object" && "name" in item && "url" in item) {
            const url = String((item as { url: unknown }).url);
            const idMatch = /[?&]id=([A-Za-z0-9._-]+)/.exec(url);
            const name = String((item as { name: unknown }).name);
            if (idMatch) push(idMatch[1]!, name);
          }
        }
      } catch {
        /* ignore parse errors */
      }
    }
  }

  return out;
}

const googlePlay: Provider = {
  id: "google-play",
  name: "Google Play Store",
  category: "appstore",
  description: "HTML probe of Google Play search results.",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const verifyUrl = `https://play.google.com/store/search?q=${encode(query)}&c=apps`;
    try {
      const res = await fetchWithTimeout(verifyUrl, {
        signal,
        timeoutMs: 10_000,
        headers: {
          "user-agent": BROWSER_UA,
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
      });
      if (!res.ok)
        return {
          status: "manual_verify",
          verifyUrl,
          detail: `Play Store search ${res.status}; open link to verify.`,
        };
      const html = await res.text();
      const hits = extractPlayTitles(html);
      if (hits.length === 0)
        return {
          status: "available",
          verifyUrl,
          detail: "No Play Store apps named like this.",
        };
      const q = query.trim().toLowerCase();
      const coreName = (t: string): string =>
        t.split(/[:–—(]|\s-\s/)[0]!.trim().toLowerCase();
      const exact = hits.filter(
        (h) => h.title.toLowerCase() === q || coreName(h.title) === q,
      );
      const evidence = hits.slice(0, 5).map((h) => ({
        title: h.title,
        url: `https://play.google.com/store/apps/details?id=${h.id}`,
      }));
      if (exact.length > 0)
        return {
          status: "taken",
          verifyUrl,
          detail: `${exact.length} exact-name app(s) on Google Play.`,
          evidence,
        };
      return {
        status: "partial",
        verifyUrl,
        detail: `${hits.length} similar Play Store apps but no exact match.`,
        evidence,
      };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `Play Store probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
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

const companiesHouseUk: Provider = {
  id: "companies-house-uk",
  name: "Companies House (UK)",
  category: "appstore",
  description: "UK company registry name lookup (live with COMPANIES_HOUSE_KEY).",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const verifyUrl = `https://find-and-update.company-information.service.gov.uk/search?q=${encode(query)}`;
    const key = process.env.COMPANIES_HOUSE_KEY;
    if (!key) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: "Set COMPANIES_HOUSE_KEY for live lookup; open link to verify.",
      };
    }
    try {
      const auth = Buffer.from(`${key}:`).toString("base64");
      const res = await fetchWithTimeout(
        `https://api.company-information.service.gov.uk/search/companies?q=${encode(query)}`,
        {
          signal,
          timeoutMs: 8000,
          headers: {
            accept: "application/json",
            authorization: `Basic ${auth}`,
          },
        },
      );
      if (!res.ok)
        return {
          status: "manual_verify",
          verifyUrl,
          detail: `Companies House API ${res.status}.`,
        };
      const data = (await res.json()) as {
        total_results?: number;
        items?: Array<{ title: string; company_number?: string }>;
      };
      const items = data.items ?? [];
      if (items.length === 0)
        return {
          status: "available",
          verifyUrl,
          detail: "No UK companies named like this.",
        };
      const q = query.trim().toLowerCase();
      const exact = items.filter((i) => i.title.trim().toLowerCase() === q);
      const evidence = items.slice(0, 5).map((i) => ({
        title: `${i.title}${i.company_number ? ` (${i.company_number})` : ""}`,
        url: i.company_number
          ? `https://find-and-update.company-information.service.gov.uk/company/${i.company_number}`
          : verifyUrl,
      }));
      if (exact.length > 0)
        return {
          status: "taken",
          verifyUrl,
          detail: `${exact.length} exact-name UK company(ies).`,
          evidence,
        };
      return {
        status: "partial",
        verifyUrl,
        detail: `${data.total_results ?? items.length} similar UK companies but no exact match.`,
        evidence,
      };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `Companies House probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
  },
};

const handelsregisterDe: Provider = {
  id: "handelsregister-de",
  name: "Handelsregister (DE)",
  category: "appstore",
  description: "German commercial register lookup (verify-link only).",
  async check(query): Promise<ProviderCheckOutput> {
    return {
      status: "manual_verify",
      verifyUrl: `https://www.handelsregister.de/rp_web/search.do?searchString=${encode(query)}`,
      detail: "German commercial register lookup.",
    };
  },
};

export const appstoreProviders: Provider[] = [
  apple,
  googlePlay,
  msStore,
  steamStore,
  itchGames,
  companiesHouseUk,
  handelsregisterDe,
];
