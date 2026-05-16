import type { Provider, ProviderCheckOutput } from "../types.js";
import { fetchWithTimeout } from "../http.js";
import { domainLabel } from "../normalize.js";

const TLDS = [
  "com",
  "net",
  "org",
  "io",
  "dev",
  "app",
  "ai",
  "co",
  "xyz",
  "me",
  "gg",
  "game",
  "games",
  "studio",
  "tech",
  "fun",
  "lol",
  "gaming",
];

const IANA_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const RDAP_ORG_FALLBACK = "https://rdap.org";

type BootstrapJson = {
  services?: Array<[string[], string[]]>;
};

let bootstrapPromise: Promise<Map<string, string>> | null = null;

function loadBootstrap(): Promise<Map<string, string>> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async (): Promise<Map<string, string>> => {
    try {
      const res = await fetchWithTimeout(IANA_BOOTSTRAP_URL, {
        timeoutMs: 8000,
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        return new Map();
      }
      const data = (await res.json()) as BootstrapJson;
      const map = new Map<string, string>();
      for (const entry of data.services ?? []) {
        const [tlds, urls] = entry;
        const base = urls?.[0];
        if (!base) continue;
        const normalized = base.replace(/\/+$/, "");
        for (const tld of tlds ?? []) {
          map.set(tld.toLowerCase(), normalized);
        }
      }
      return map;
    } catch {
      return new Map();
    }
  })();
  return bootstrapPromise;
}

async function rdapUrlFor(domain: string, tld: string): Promise<string> {
  const map = await loadBootstrap();
  const base = map.get(tld.toLowerCase()) ?? RDAP_ORG_FALLBACK;
  return `${base}/domain/${domain}`;
}

function namecheapUrl(domain: string): string {
  return `https://www.namecheap.com/domains/registration/results/?domain=${domain}`;
}

function makeDomainProvider(tld: string): Provider {
  return {
    id: `domain-${tld}`,
    name: `.${tld} domain`,
    category: "domain",
    description: `Check ${tld.toUpperCase()} registration via RDAP.`,
    async check(query, signal): Promise<ProviderCheckOutput> {
      const label = domainLabel(query);
      if (!label) {
        return {
          status: "unknown",
          detail: "Query has no valid domain-label characters.",
        };
      }
      const domain = `${label}.${tld}`;
      const verifyUrl = namecheapUrl(domain);
      try {
        const url = await rdapUrlFor(domain, tld);
        const res = await fetchWithTimeout(url, {
          signal,
          timeoutMs: 8000,
          headers: { accept: "application/rdap+json,application/json" },
        });
        if (res.status === 404) {
          return {
            status: "available",
            verifyUrl,
            detail: `${domain} not registered (RDAP 404).`,
            evidence: [{ title: domain, url: verifyUrl }],
          };
        }
        if (res.status === 200) {
          return {
            status: "taken",
            verifyUrl,
            detail: `${domain} is registered.`,
            evidence: [{ title: domain, url: `https://${domain}` }],
          };
        }
        if (res.status === 429) {
          return {
            status: "unknown",
            verifyUrl,
            detail: `RDAP rate-limited for ${domain}.`,
          };
        }
        return {
          status: "manual_verify",
          verifyUrl,
          detail: `RDAP returned ${res.status} for ${domain}; no clear answer.`,
        };
      } catch (err) {
        return {
          status: "manual_verify",
          verifyUrl,
          detail: `RDAP fetch failed for ${domain} (${err instanceof Error ? err.message : "unknown"}).`,
        };
      }
    },
  };
}

export const domainProviders: Provider[] = TLDS.map(makeDomainProvider);
