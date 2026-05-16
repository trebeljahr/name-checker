import type { Provider, ProviderCheckOutput } from "../types.js";
import { encode, fetchWithTimeout } from "../http.js";

const safe = (q: string): string => encode(q.trim());

const tmview: Provider = {
  id: "tmview",
  name: "TMview (multi-office)",
  category: "trademark",
  description:
    "Joint EUIPO/WIPO/national search across 70+ trademark offices. Live API.",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const verifyUrl = `https://www.tmdn.org/tmview/#/tmview/results?criteria=C&basicSearch=${safe(query)}`;
    try {
      const res = await fetchWithTimeout(
        "https://www.tmdn.org/tmview/api/search/results",
        {
          method: "POST",
          signal,
          timeoutMs: 9000,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            page: "1",
            pageSize: "10",
            criteria: "C",
            basicSearch: query,
            niceClass: [],
            fOffices: [],
            fields: [
              "ST13",
              "markVerbalElementText",
              "applicationNumber",
              "applicationDate",
              "tradeMarkStatus",
              "officeCode",
            ],
          }),
        },
      );
      if (!res.ok) {
        return {
          status: "manual_verify",
          verifyUrl,
          detail: `TMview API responded ${res.status}; verify manually.`,
        };
      }
      const data = (await res.json()) as {
        totalResults?: number;
        tradeMarks?: Array<{
          markVerbalElementText?: string;
          officeCode?: string;
          tradeMarkStatus?: string;
          applicationNumber?: string;
        }>;
      };
      const total = data.totalResults ?? data.tradeMarks?.length ?? 0;
      if (total === 0) {
        return {
          status: "available",
          verifyUrl,
          detail: "No live trademarks found in TMview across all offices.",
        };
      }
      const exact = (data.tradeMarks ?? []).filter(
        (m) =>
          (m.markVerbalElementText ?? "").trim().toLowerCase() ===
          query.trim().toLowerCase(),
      );
      const evidence = (data.tradeMarks ?? []).slice(0, 5).map((m) => ({
        title: `${m.markVerbalElementText ?? "?"} — ${m.officeCode ?? ""} ${m.tradeMarkStatus ?? ""}`.trim(),
        url: verifyUrl,
      }));
      if (exact.length > 0) {
        return {
          status: "taken",
          verifyUrl,
          evidence,
          detail: `${exact.length} exact-match trademark(s) in TMview; ${total} total hits.`,
        };
      }
      return {
        status: "partial",
        verifyUrl,
        evidence,
        detail: `${total} similar trademark hits but no exact-match. Review for confusion risk.`,
      };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `TMview unreachable (${err instanceof Error ? err.message : "unknown"}); verify manually.`,
      };
    }
  },
};

function verifyLinkProvider(
  id: string,
  name: string,
  description: string,
  buildUrl: (q: string) => string,
  detail: string,
): Provider {
  return {
    id,
    name,
    category: "trademark",
    description,
    async check(query): Promise<ProviderCheckOutput> {
      return {
        status: "manual_verify",
        verifyUrl: buildUrl(query),
        detail,
      };
    },
  };
}

const uspto = verifyLinkProvider(
  "uspto",
  "USPTO TMsearch",
  "United States Patent and Trademark Office. Check IC 009 (downloadable game software) and IC 041 (entertainment services).",
  (q) =>
    `https://tmsearch.uspto.gov/search/search-information?searchType=substring&q=${safe(q)}`,
  "Open the link and search IC 009 + IC 041 for game/entertainment marks.",
);

const euipo = verifyLinkProvider(
  "euipo",
  "EUIPO eSearch Plus",
  "European Union Intellectual Property Office. EU-wide trademarks.",
  (q) => `https://euipo.europa.eu/eSearch/#basic/1/0/0/0/${safe(q)}`,
  "Open eSearch Plus and verify classes 9 + 41.",
);

const dpma = verifyLinkProvider(
  "dpma",
  "DPMA register (Germany)",
  "Deutsches Patent- und Markenamt. German national priority filings.",
  (q) =>
    `https://register.dpma.de/DPMAregister/marke/experte/recherche?BUTTONS=on&MN=${safe(q)}`,
  "DPMA captcha may apply. Search by Markenname (MN).",
);

const wipo = verifyLinkProvider(
  "wipo",
  "WIPO Global Brand Database",
  "International (Madrid Protocol) and 70+ national collections.",
  (q) =>
    `https://branddb.wipo.int/en/quicksearch/brand/${safe(q)}`,
  "Global Brand DB covers Madrid Protocol + national registers.",
);

const ukipo = verifyLinkProvider(
  "ukipo",
  "UKIPO trademark search",
  "UK Intellectual Property Office. Post-Brexit UK trademarks.",
  (q) =>
    `https://trademarks.ipo.gov.uk/ipo-tmtext?detailsrequested=C&wordSearchPhrase=${safe(q)}`,
  "Search UK national register.",
);

const cipo = verifyLinkProvider(
  "cipo",
  "CIPO trademark search (Canada)",
  "Canadian Intellectual Property Office.",
  (q) =>
    `https://ised-isde.canada.ca/cipo/trademark-search/srch?lang=eng&searchCriteriaBean.textInputs[0].txtValue=${safe(q)}`,
  "Search Canadian trademarks database.",
);

const ipau = verifyLinkProvider(
  "ipau",
  "IP Australia ATMOSS",
  "Australian Trade Marks Online Search System.",
  (q) =>
    `https://search.ipaustralia.gov.au/trademarks/search/quick?q=${safe(q)}`,
  "Search Australian trademarks.",
);

export const trademarkProviders: Provider[] = [
  tmview,
  uspto,
  euipo,
  dpma,
  wipo,
  ukipo,
  cipo,
  ipau,
];
