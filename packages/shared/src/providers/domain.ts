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

function namecheapUrl(domain: string): string {
  return `https://www.namecheap.com/domains/registration/results/?domain=${domain}`;
}

function rdapUrlFor(domain: string): string {
  return `https://rdap.org/domain/${domain}`;
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
        const res = await fetchWithTimeout(rdapUrlFor(domain), {
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
