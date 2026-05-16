import type { Provider, ProviderCheckOutput, Evidence } from "../types.js";
import { encode, fetchWithTimeout } from "../http.js";

const safe = (q: string): string => encode(q.trim());

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

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

const USPTO_TARGET_CLASSES = new Set(["IC 009", "IC 041"]);

type UsptoHit = {
  id?: string;
  source?: {
    wordmark?: string | null;
    id?: string | null;
    internationalClass?: string[] | null;
    alive?: boolean | null;
    registrationId?: string | null;
    registrationDate?: string | null;
    abandonDate?: string | null;
    filedDate?: string | null;
  };
};

const uspto: Provider = {
  id: "uspto",
  name: "USPTO TMsearch",
  category: "trademark",
  description:
    "United States Patent and Trademark Office. Live Elasticsearch API; filters IC 009 (software) + IC 041 (entertainment).",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const verifyUrl = `https://tmsearch.uspto.gov/search/search-information?searchType=substring&q=${safe(query)}`;
    const fallback = (detail: string): ProviderCheckOutput => ({
      status: "manual_verify",
      verifyUrl,
      detail,
    });
    try {
      const res = await fetchWithTimeout(
        "https://tmsearch.uspto.gov/prod-stage-v1-0-0/tmsearch",
        {
          method: "POST",
          signal,
          timeoutMs: 10_000,
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            "user-agent": BROWSER_UA,
            origin: "https://tmsearch.uspto.gov",
            referer: "https://tmsearch.uspto.gov/",
          },
          body: JSON.stringify({
            query: {
              bool: {
                must: [{ term: { WM: { value: query.trim() } } }],
              },
            },
            size: 50,
            from: 0,
            track_total_hits: true,
            _source: [
              "wordmark",
              "id",
              "internationalClass",
              "alive",
              "registrationId",
              "registrationDate",
              "abandonDate",
              "filedDate",
            ],
          }),
        },
      );
      if (!res.ok) {
        return fallback(
          `USPTO API responded ${res.status}; verify manually at tmsearch.uspto.gov.`,
        );
      }
      const data = (await res.json()) as {
        hits?: { totalValue?: number; hits?: UsptoHit[] };
      };
      const total = data.hits?.totalValue ?? 0;
      const hits = data.hits?.hits ?? [];
      if (total === 0) {
        return {
          status: "available",
          verifyUrl,
          detail: "No USPTO trademarks match (exact wordmark search).",
        };
      }
      const needle = query.trim().toLowerCase();
      const inTargetClass = (h: UsptoHit): boolean =>
        (h.source?.internationalClass ?? []).some((c) =>
          USPTO_TARGET_CLASSES.has(c),
        );
      const isExact = (h: UsptoHit): boolean =>
        (h.source?.wordmark ?? "").trim().toLowerCase() === needle;
      const isAlive = (h: UsptoHit): boolean => h.source?.alive === true;

      const exactClassed = hits.filter(
        (h) => isExact(h) && inTargetClass(h) && isAlive(h),
      );
      const evidenceFrom = (list: UsptoHit[]): Evidence[] =>
        list.slice(0, 5).map((h) => {
          const wm = h.source?.wordmark ?? "?";
          const ics = (h.source?.internationalClass ?? []).join(", ") || "—";
          const alive = h.source?.alive ? "live" : "dead";
          const sn = h.source?.id ?? h.id ?? "";
          return {
            title: `${wm} — ${ics} (${alive}${sn ? `, SN ${sn}` : ""})`,
            url: sn
              ? `https://tsdr.uspto.gov/#caseNumber=${encode(sn)}&caseSearchType=US_APPLICATION&caseType=DEFAULT&searchType=statusSearch`
              : verifyUrl,
          };
        });

      if (exactClassed.length > 0) {
        return {
          status: "taken",
          verifyUrl,
          evidence: evidenceFrom(exactClassed),
          detail: `${exactClassed.length} live exact-match USPTO mark(s) in IC 009/041 of ${total} total hits.`,
        };
      }
      const exactAny = hits.filter((h) => isExact(h) && isAlive(h));
      if (exactAny.length > 0) {
        return {
          status: "partial",
          verifyUrl,
          evidence: evidenceFrom(exactAny),
          detail: `${exactAny.length} live exact-match USPTO mark(s) outside IC 009/041; check confusion risk.`,
        };
      }
      const liveClassed = hits.filter((h) => inTargetClass(h) && isAlive(h));
      if (liveClassed.length > 0) {
        return {
          status: "partial",
          verifyUrl,
          evidence: evidenceFrom(liveClassed),
          detail: `${liveClassed.length} similar live mark(s) in IC 009/041 of ${total} total hits.`,
        };
      }
      return {
        status: "partial",
        verifyUrl,
        evidence: evidenceFrom(hits),
        detail: `${total} USPTO hits but none live in IC 009/041; review residual risk.`,
      };
    } catch (err) {
      return fallback(
        `USPTO API unreachable (${err instanceof Error ? err.message : "unknown"}); verify manually.`,
      );
    }
  },
};

const EUIPO_TARGET_CLASSES = new Set(["9", "41"]);
const EUIPO_DEAD_DESCRIPTORS = new Set([
  "CSD_10",
  "CSD_12",
  "CSD_13",
  "CSD_14",
]);

type EuipoItem = {
  name?: string;
  nice?: string;
  status?: string;
  commonDescriptor?: string;
  applicantname?: string;
  number?: string;
  basis?: string;
};

function euipoClasses(item: EuipoItem): string[] {
  return (item.nice ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

function euipoIsAlive(item: EuipoItem): boolean {
  return !EUIPO_DEAD_DESCRIPTORS.has(item.commonDescriptor ?? "");
}

const euipo: Provider = {
  id: "euipo",
  name: "EUIPO eSearch Plus",
  category: "trademark",
  description:
    "European Union Intellectual Property Office. Live eSearch backend; filters Nice classes 9 + 41.",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const verifyUrl = `https://euipo.europa.eu/eSearch/#basic/1/0/0/0/${safe(query)}`;
    const fallback = (detail: string): ProviderCheckOutput => ({
      status: "manual_verify",
      verifyUrl,
      detail,
    });
    try {
      const body = new URLSearchParams({
        start: "0",
        rows: "50",
        searchMode: "basic",
        criterion_1: "MarkVerbalElementText",
        term_1: query.trim(),
        operator_1: "OR",
      }).toString();
      const res = await fetchWithTimeout(
        "https://euipo.europa.eu/copla/ctmsearch/json",
        {
          method: "POST",
          signal,
          timeoutMs: 10_000,
          headers: {
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            accept: "application/json",
            "user-agent": BROWSER_UA,
            origin: "https://euipo.europa.eu",
            referer: "https://euipo.europa.eu/eSearch/",
            "x-requested-with": "XMLHttpRequest",
          },
          body,
        },
      );
      if (!res.ok) {
        return fallback(
          `EUIPO API responded ${res.status}; verify manually at eSearch Plus.`,
        );
      }
      const data = (await res.json()) as {
        total?: number;
        items?: EuipoItem[];
      };
      const total = data.total ?? 0;
      const items = data.items ?? [];
      if (total === 0) {
        return {
          status: "available",
          verifyUrl,
          detail: "No EUIPO trademarks match (verbal element search).",
        };
      }
      const needle = query.trim().toLowerCase();
      const inTargetClass = (i: EuipoItem): boolean =>
        euipoClasses(i).some((c) => EUIPO_TARGET_CLASSES.has(c));
      const isExact = (i: EuipoItem): boolean =>
        (i.name ?? "").trim().toLowerCase() === needle;

      const evidenceFrom = (list: EuipoItem[]): Evidence[] =>
        list.slice(0, 5).map((i) => {
          const cls = i.nice ?? "—";
          const live = euipoIsAlive(i) ? "live" : "dead";
          const num = i.number ?? "";
          return {
            title: `${i.name ?? "?"} — Nice ${cls} (${live}, ${i.status ?? "?"})${i.applicantname ? `, ${i.applicantname}` : ""}`,
            url: num
              ? `https://euipo.europa.eu/eSearch/#details/trademarks/${encode(num)}`
              : verifyUrl,
          };
        });

      const exactLiveClassed = items.filter(
        (i) => isExact(i) && inTargetClass(i) && euipoIsAlive(i),
      );
      if (exactLiveClassed.length > 0) {
        return {
          status: "taken",
          verifyUrl,
          evidence: evidenceFrom(exactLiveClassed),
          detail: `${exactLiveClassed.length} live exact-match EUIPO mark(s) in Nice 9/41 of ${total} total hits.`,
        };
      }
      const exactLiveAny = items.filter((i) => isExact(i) && euipoIsAlive(i));
      if (exactLiveAny.length > 0) {
        return {
          status: "partial",
          verifyUrl,
          evidence: evidenceFrom(exactLiveAny),
          detail: `${exactLiveAny.length} live exact-match EUIPO mark(s) outside Nice 9/41; check confusion risk.`,
        };
      }
      const liveClassed = items.filter(
        (i) => inTargetClass(i) && euipoIsAlive(i),
      );
      if (liveClassed.length > 0) {
        return {
          status: "partial",
          verifyUrl,
          evidence: evidenceFrom(liveClassed),
          detail: `${liveClassed.length} similar live EUIPO mark(s) in Nice 9/41 of ${total} total hits.`,
        };
      }
      return {
        status: "partial",
        verifyUrl,
        evidence: evidenceFrom(items),
        detail: `${total} EUIPO hits but none live in Nice 9/41; review residual risk.`,
      };
    } catch (err) {
      return fallback(
        `EUIPO API unreachable (${err instanceof Error ? err.message : "unknown"}); verify manually.`,
      );
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

// DPMA register sits behind an F5/TSPD JS-fingerprinting anti-bot gate that
// returns an empty body until a browser executes the challenge script. Without
// a headless-browser fallback (Playwright/Puppeteer), a plain fetch cannot
// reach the form or the result XHRs. Keep verify-link until we add one.
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
  (q) => `https://branddb.wipo.int/en/quicksearch/brand/${safe(q)}`,
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
  (q) => `https://search.ipaustralia.gov.au/trademarks/search/quick?q=${safe(q)}`,
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
