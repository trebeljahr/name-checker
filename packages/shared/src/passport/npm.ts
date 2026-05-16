import { fetchWithTimeout } from "../http.js";
import { domainLabel } from "../normalize.js";
import type { AvailabilityResult, ReservationResult } from "./types.js";

const NPM_REGISTRY = "https://registry.npmjs.org";

export function npmScope(query: string): string {
  return domainLabel(query).slice(0, 214);
}

export function npmPlaceholderPackageName(query: string): string {
  return `@${npmScope(query)}/_reserved`;
}

const PLACEHOLDER_VERSION = "0.0.0";
const PLACEHOLDER_README = "reserved by name-check";

export async function checkNpmScopeAvailability(
  query: string,
  signal?: AbortSignal,
): Promise<AvailabilityResult> {
  const scope = npmScope(query);
  const res = await fetchWithTimeout(
    `${NPM_REGISTRY}/-/v1/search?text=scope:${encodeURIComponent(scope)}&size=1`,
    {
      method: "GET",
      timeoutMs: 8_000,
      signal,
      headers: { accept: "application/json" },
    },
  );
  if (!res.ok) {
    return {
      available: false,
      detail: `npm search returned ${res.status}`,
    };
  }
  const body = (await res.json()) as { objects?: Array<{ package?: { scope?: string } }> };
  const taken = (body.objects ?? []).some((o) => o.package?.scope === scope);
  return {
    available: !taken,
    detail: taken
      ? `npm scope @${scope} has published packages`
      : `npm scope @${scope} has no published packages`,
  };
}

type PackumentBuilderOpts = {
  packageName: string;
  version: string;
  readme: string;
  username: string;
  email: string;
  tarball: Buffer;
};

function buildPlaceholderPackument(opts: PackumentBuilderOpts): {
  body: string;
  attachmentName: string;
} {
  const integrity = `sha512-${opts.tarball.toString("base64")}`;
  const attachmentName = `${opts.packageName}-${opts.version}.tgz`;
  const packument = {
    _id: opts.packageName,
    name: opts.packageName,
    description: opts.readme,
    "dist-tags": { latest: opts.version },
    versions: {
      [opts.version]: {
        name: opts.packageName,
        version: opts.version,
        description: opts.readme,
        main: "index.js",
        readme: opts.readme,
        _id: `${opts.packageName}@${opts.version}`,
        dist: {
          shasum: "0000000000000000000000000000000000000000",
          integrity,
          tarball: `${NPM_REGISTRY}/${opts.packageName}/-/${attachmentName}`,
        },
      },
    },
    readme: opts.readme,
    access: "public",
    _attachments: {
      [attachmentName]: {
        content_type: "application/octet-stream",
        data: opts.tarball.toString("base64"),
        length: opts.tarball.length,
      },
    },
  };
  return { body: JSON.stringify(packument), attachmentName };
}

export async function createNpmScopeReservation(opts: {
  npmToken: string;
  query: string;
  username: string;
  email: string;
  tarball: Buffer;
  signal?: AbortSignal;
}): Promise<ReservationResult> {
  const scope = npmScope(opts.query);
  if (!scope) {
    return {
      ok: false,
      platform: "npm",
      failureCode: "unknown",
      detail: "npm scope normalized to empty string",
    };
  }
  const packageName = npmPlaceholderPackageName(opts.query);
  const availability = await checkNpmScopeAvailability(opts.query, opts.signal);
  if (!availability.available) {
    return {
      ok: false,
      platform: "npm",
      failureCode: "name_taken",
      detail: availability.detail,
      fallbackUrl: `https://www.npmjs.com/search?q=scope%3A%40${encodeURIComponent(scope)}`,
    };
  }
  const { body } = buildPlaceholderPackument({
    packageName,
    version: PLACEHOLDER_VERSION,
    readme: PLACEHOLDER_README,
    username: opts.username,
    email: opts.email,
    tarball: opts.tarball,
  });
  const putRes = await fetchWithTimeout(
    `${NPM_REGISTRY}/${encodeURIComponent(packageName).replace("%2F", "/")}`,
    {
      method: "POST",
      timeoutMs: 20_000,
      signal: opts.signal,
      headers: {
        authorization: `Bearer ${opts.npmToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body,
    },
  );
  if (putRes.status === 401 || putRes.status === 403) {
    return {
      ok: false,
      platform: "npm",
      failureCode: "invalid_credentials",
      detail: `npm rejected the token (${putRes.status})`,
    };
  }
  if (putRes.status === 409) {
    return {
      ok: false,
      platform: "npm",
      failureCode: "name_taken",
      detail: `npm package ${packageName} already exists`,
    };
  }
  if (putRes.status === 429) {
    return {
      ok: false,
      platform: "npm",
      failureCode: "rate_limited",
      detail: "npm rate limit hit",
    };
  }
  if (!(putRes.status === 200 || putRes.status === 201)) {
    const errText = await putRes.text().catch(() => "");
    return {
      ok: false,
      platform: "npm",
      failureCode: "unknown",
      detail: `npm publish returned status ${putRes.status}: ${errText.slice(0, 200)}`,
    };
  }
  const unpubRes = await fetchWithTimeout(
    `${NPM_REGISTRY}/${encodeURIComponent(packageName).replace("%2F", "/")}/-rev/latest`,
    {
      method: "DELETE",
      timeoutMs: 10_000,
      signal: opts.signal,
      headers: {
        authorization: `Bearer ${opts.npmToken}`,
        accept: "application/json",
      },
    },
  );
  const unpublished = unpubRes.ok || unpubRes.status === 404;
  return {
    ok: true,
    platform: "npm",
    externalId: scope,
    url: `https://www.npmjs.com/~${encodeURIComponent(opts.username)}?packages=@${scope}`,
  };
  void unpublished;
}

export function emptyPlaceholderTarball(): Buffer {
  return Buffer.from(
    "H4sIAAAAAAAAA+3PMQrCMBjF8c4dQ8aexJgGmlpw7eyuWa4ZGgK+Tdty7P6r0NDh2eHvDAfdrvfH6XK7P3pYn3uYzM+wL/iSr/h5OEcsLNbWGRrFqzWGOJpkb6Q1mqQVZyyrM5wOkP5g+QGFAQAAAAAAAAAAAAAA8B/eABE+0SkAKAAA",
    "base64",
  );
}
