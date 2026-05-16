import type { Provider, ProviderCheckOutput } from "../types.js";
import { encode, fetchWithTimeout } from "../http.js";
import { slug } from "../normalize.js";

function exists200or404(detailNoun: string, buildUrl: (q: string) => { api: string; web: string }) {
  return async (query: string, signal?: AbortSignal): Promise<ProviderCheckOutput> => {
    const name = slug(query);
    if (!name) return { status: "unknown", detail: "No valid name chars." };
    const urls = buildUrl(name);
    try {
      const res = await fetchWithTimeout(urls.api, {
        signal,
        timeoutMs: 8000,
        headers: { accept: "application/json" },
      });
      if (res.status === 200)
        return {
          status: "taken",
          verifyUrl: urls.web,
          detail: `${detailNoun} '${name}' exists.`,
          evidence: [{ title: name, url: urls.web }],
        };
      if (res.status === 404)
        return {
          status: "available",
          verifyUrl: urls.web,
          detail: `${detailNoun} '${name}' is free.`,
        };
      return {
        status: "manual_verify",
        verifyUrl: urls.web,
        detail: `Got ${res.status} for ${detailNoun}.`,
      };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl: urls.web,
        detail: `${detailNoun} probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
  };
}

const npm: Provider = {
  id: "npm",
  name: "npm package",
  category: "package",
  description: "npm registry package name.",
  check: exists200or404("npm package", (n) => ({
    api: `https://registry.npmjs.org/${encode(n)}`,
    web: `https://www.npmjs.com/package/${n}`,
  })),
};

const pypi: Provider = {
  id: "pypi",
  name: "PyPI package",
  category: "package",
  check: exists200or404("PyPI package", (n) => ({
    api: `https://pypi.org/pypi/${encode(n)}/json`,
    web: `https://pypi.org/project/${n}/`,
  })),
};

const crates: Provider = {
  id: "crates",
  name: "crates.io crate",
  category: "package",
  check: exists200or404("Rust crate", (n) => ({
    api: `https://crates.io/api/v1/crates/${encode(n)}`,
    web: `https://crates.io/crates/${n}`,
  })),
};

const rubygems: Provider = {
  id: "rubygems",
  name: "RubyGems gem",
  category: "package",
  check: exists200or404("Ruby gem", (n) => ({
    api: `https://rubygems.org/api/v1/gems/${encode(n)}.json`,
    web: `https://rubygems.org/gems/${n}`,
  })),
};

const maven: Provider = {
  id: "maven",
  name: "Maven Central artifact",
  category: "package",
  description: "Searches Maven Central by artifactId.",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const name = slug(query);
    const verifyUrl = `https://central.sonatype.com/search?q=${encode(query)}`;
    if (!name) return { status: "unknown", detail: "No valid name chars." };
    try {
      const res = await fetchWithTimeout(
        `https://search.maven.org/solrsearch/select?q=a:%22${encode(name)}%22&rows=1&wt=json`,
        { signal, timeoutMs: 8000, headers: { accept: "application/json" } },
      );
      if (!res.ok)
        return { status: "manual_verify", verifyUrl, detail: `Got ${res.status}.` };
      const data = (await res.json()) as {
        response?: { numFound?: number; docs?: Array<{ g?: string; a?: string }> };
      };
      const n = data.response?.numFound ?? 0;
      if (n === 0)
        return { status: "available", verifyUrl, detail: `No Maven artifactId '${name}'.` };
      const evidence = (data.response?.docs ?? []).slice(0, 5).map((d) => ({
        title: `${d.g}:${d.a}`,
        url: verifyUrl,
      }));
      return {
        status: "taken",
        verifyUrl,
        detail: `${n} Maven artifact(s) named '${name}'.`,
        evidence,
      };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `Maven probe failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
  },
};

export const packageProviders: Provider[] = [npm, pypi, crates, rubygems, maven];
