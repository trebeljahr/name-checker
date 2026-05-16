import { fetchWithTimeout } from "../http.js";
import { domainLabel } from "../normalize.js";
import type { AvailabilityResult, ReservationResult } from "./types.js";

const GH_API = "https://api.github.com";
const GH_OAUTH_BASE = "https://github.com/login/oauth";

export function githubOrgLogin(query: string): string {
  return domainLabel(query).slice(0, 39);
}

export function githubAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    scope: "admin:org user:email",
    state: opts.state,
    allow_signup: "false",
  });
  return `${GH_OAUTH_BASE}/authorize?${params.toString()}`;
}

export function githubSoftFallbackUrl(query: string): string {
  const login = githubOrgLogin(query);
  const params = new URLSearchParams({ login, plan: "free" });
  return `https://github.com/account/organizations/new?${params.toString()}`;
}

export async function exchangeGithubCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  signal?: AbortSignal;
}): Promise<{ accessToken: string; scope: string }> {
  const res = await fetchWithTimeout(`${GH_OAUTH_BASE}/access_token`, {
    method: "POST",
    timeoutMs: 10_000,
    signal: opts.signal,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
    }),
  });
  if (!res.ok) {
    throw new Error(`github token exchange failed: ${res.status}`);
  }
  const body = (await res.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!body.access_token) {
    throw new Error(
      body.error_description ?? body.error ?? "github token exchange returned no access_token",
    );
  }
  return { accessToken: body.access_token, scope: body.scope ?? "" };
}

export async function checkGithubOrgAvailability(
  login: string,
  signal?: AbortSignal,
): Promise<AvailabilityResult> {
  const res = await fetchWithTimeout(`${GH_API}/orgs/${encodeURIComponent(login)}`, {
    method: "GET",
    timeoutMs: 8_000,
    signal,
    headers: { accept: "application/vnd.github+json" },
  });
  if (res.status === 404) {
    return { available: true, detail: `org "${login}" not found on github` };
  }
  if (res.status === 200) {
    return { available: false, detail: `org "${login}" already exists` };
  }
  return {
    available: false,
    detail: `github org lookup returned status ${res.status}`,
  };
}

export async function createGithubOrg(opts: {
  accessToken: string;
  login: string;
  adminUsername: string;
  signal?: AbortSignal;
}): Promise<ReservationResult> {
  const availability = await checkGithubOrgAvailability(opts.login, opts.signal);
  if (!availability.available) {
    return {
      ok: false,
      platform: "github",
      failureCode: "name_taken",
      detail: availability.detail,
      fallbackUrl: `https://github.com/${encodeURIComponent(opts.login)}`,
    };
  }
  const res = await fetchWithTimeout(`${GH_API}/admin/organizations`, {
    method: "POST",
    timeoutMs: 15_000,
    signal: opts.signal,
    headers: {
      authorization: `Bearer ${opts.accessToken}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({
      login: opts.login,
      admin: opts.adminUsername,
      profile_name: opts.login,
    }),
  });
  if (res.status === 201) {
    const body = (await res.json()) as { id?: number; html_url?: string };
    return {
      ok: true,
      platform: "github",
      externalId: String(body.id ?? opts.login),
      url: body.html_url ?? `https://github.com/${encodeURIComponent(opts.login)}`,
    };
  }
  if (res.status === 403 || res.status === 404) {
    return {
      ok: false,
      platform: "github",
      failureCode: "soft_fallback",
      detail:
        "github admin org-create endpoint is not available on github.com (GHES-only). use soft fallback link.",
      fallbackUrl: githubSoftFallbackUrl(opts.login),
    };
  }
  if (res.status === 401) {
    return {
      ok: false,
      platform: "github",
      failureCode: "invalid_credentials",
      detail: "github rejected the access token",
    };
  }
  if (res.status === 422) {
    return {
      ok: false,
      platform: "github",
      failureCode: "name_taken",
      detail: "github reports the org login is taken or invalid",
    };
  }
  if (res.status === 429) {
    return {
      ok: false,
      platform: "github",
      failureCode: "rate_limited",
      detail: "github rate limit hit",
    };
  }
  return {
    ok: false,
    platform: "github",
    failureCode: "unknown",
    detail: `github org create returned status ${res.status}`,
  };
}
