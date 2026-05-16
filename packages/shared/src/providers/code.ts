import type { Provider, ProviderCheckOutput } from "../types.js";
import { encode, fetchWithTimeout } from "../http.js";
import { handle } from "../normalize.js";

const githubRepoSearch: Provider = {
  id: "github-repo-search",
  name: "GitHub repo search",
  category: "code",
  description: "Searches GitHub for repos exactly named the query.",
  async check(query, signal): Promise<ProviderCheckOutput> {
    const name = handle(query).replace(/_/g, "-");
    const verifyUrl = `https://github.com/search?q=${encode(query)}+in%3Aname&type=repositories`;
    if (!name) return { status: "unknown", detail: "No valid repo-name chars." };
    try {
      const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
      const headers: Record<string, string> = { accept: "application/vnd.github+json" };
      if (token) headers.authorization = `Bearer ${token}`;
      const res = await fetchWithTimeout(
        `https://api.github.com/search/repositories?q=${encode(name)}+in:name&per_page=10`,
        {
          signal,
          timeoutMs: 8000,
          headers,
        },
      );
      if (res.status === 401)
        return {
          status: "manual_verify",
          verifyUrl,
          detail: "GitHub token invalid or expired.",
        };
      if (res.status === 403) {
        const body = await res.text().catch(() => "");
        if (/rate limit/i.test(body))
          return {
            status: "unknown",
            verifyUrl,
            detail: "GitHub API rate-limited. Set GITHUB_TOKEN to raise the limit.",
          };
        return {
          status: "manual_verify",
          verifyUrl,
          detail: `Got 403.`,
        };
      }
      if (!res.ok)
        return { status: "manual_verify", verifyUrl, detail: `Got ${res.status}.` };
      const data = (await res.json()) as {
        total_count: number;
        items: Array<{ full_name: string; html_url: string; stargazers_count: number }>;
      };
      if (data.total_count === 0)
        return { status: "available", verifyUrl, detail: "No GitHub repos by that name." };
      const exact = data.items.filter(
        (i) =>
          i.full_name.split("/")[1]?.toLowerCase() === name.toLowerCase(),
      );
      const evidence = data.items.slice(0, 5).map((i) => ({
        title: `${i.full_name} (★${i.stargazers_count})`,
        url: i.html_url,
      }));
      if (exact.length > 0)
        return {
          status: "taken",
          verifyUrl,
          detail: `${exact.length} GitHub repo(s) named exactly '${name}'.`,
          evidence,
        };
      return {
        status: "partial",
        verifyUrl,
        detail: `${data.total_count} similar GitHub repos but no exact name match.`,
        evidence,
      };
    } catch (err) {
      return {
        status: "manual_verify",
        verifyUrl,
        detail: `GitHub search failed (${err instanceof Error ? err.message : "unknown"}).`,
      };
    }
  },
};

export const codeProviders: Provider[] = [githubRepoSearch];
