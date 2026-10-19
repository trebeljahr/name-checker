import type { ErrorEvent } from "@sentry/browser";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Sdk from "./sdk";

let sdkImported = false;
vi.mock("@sentry/browser", () => {
  sdkImported = true;
  return {};
});

const { createErrorReporter, releaseName, reportClientError, startErrorReporting } = await import(
  "./reporter"
);

type Sentry = typeof Sdk;

/** A stand-in SDK that records what it was asked to do. */
const fakeSdk = (): {
  sdk: Sentry;
  init: ReturnType<typeof vi.fn>;
  capture: ReturnType<typeof vi.fn>;
} => {
  const init = vi.fn();
  const capture = vi.fn();
  const integration = (name: string) => () => ({ name });
  const sdk = {
    init,
    captureException: capture,
    eventFiltersIntegration: integration("EventFilters"),
    functionToStringIntegration: integration("FunctionToString"),
    browserApiErrorsIntegration: integration("BrowserApiErrors"),
    breadcrumbsIntegration: vi.fn(integration("Breadcrumbs")),
    globalHandlersIntegration: integration("GlobalHandlers"),
    linkedErrorsIntegration: integration("LinkedErrors"),
    dedupeIntegration: integration("Dedupe"),
    httpContextIntegration: integration("HttpContext"),
  } as unknown as Sentry;
  return { sdk, init, capture };
};

const options = (dsn: string, load: () => Promise<Sentry>) => ({
  dsn,
  load,
  release: "name-checker@0.1.0+abcdef012345",
  environment: "production",
  platform: () => "web" as const,
});

type Hooks = {
  beforeSend: (event: ErrorEvent, hint: unknown) => ErrorEvent | null;
  beforeBreadcrumb: (breadcrumb: Record<string, unknown>) => Record<string, unknown> | null;
};

/** The hooks the reporter hands to `init`, from a started reporter. */
const startedHooks = async (): Promise<Hooks> => {
  const { sdk, init } = fakeSdk();
  await createErrorReporter(options("https://k@h/1", async () => sdk)).start();
  return init.mock.calls[0]?.[0] as Hooks;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("without a DSN", () => {
  it("never loads the SDK, and reporting does nothing", async () => {
    const load = vi.fn();
    const reporter = createErrorReporter(options("", load));
    reporter.report(new Error("boom"), { source: "boundary" });
    expect(await reporter.start()).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it("is what this build does: the default reporter imports nothing", async () => {
    // Vitest runs with no NEXT_PUBLIC_SENTRY_DSN, exactly like a build without one.
    expect(process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").toBe("");
    reportClientError(new Error("boom"), { source: "global" });
    expect(await startErrorReporting()).toBe(false);
    expect(sdkImported).toBe(false);
  });
});

describe("with a DSN", () => {
  it("loads the SDK once and starts it without tracing, replay, sessions or default integrations", async () => {
    const { sdk, init } = fakeSdk();
    const load = vi.fn(async () => sdk);
    const reporter = createErrorReporter(options("https://key@glitchtip.example.com/2", load));

    expect(await Promise.all([reporter.start(), reporter.start()])).toEqual([true, true]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledTimes(1);

    const config = init.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(config).toMatchObject({
      dsn: "https://key@glitchtip.example.com/2",
      release: "name-checker@0.1.0+abcdef012345",
      environment: "production",
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: { allow: ["User-Agent"] }, response: false },
        httpBodies: [],
        urlQueryParams: false,
        stackFrameVariables: false,
      },
      sendClientReports: false,
      defaultIntegrations: false,
      initialScope: { tags: { platform: "web" } },
    });
    expect(config).not.toHaveProperty("tracesSampleRate");
    expect(config).not.toHaveProperty("replaysSessionSampleRate");
    const names = (config.integrations as Array<{ name: string }>).map((i) => i.name);
    expect(names).not.toContain("BrowserSession");
    expect(names).not.toContain("BrowserTracing");
    expect(names).not.toContain("Replay");
    expect(names).not.toContain("Console");
    expect(names).not.toContain("CultureContext");
    expect(sdk.breadcrumbsIntegration).toHaveBeenCalledWith(
      expect.objectContaining({ dom: false, sentry: false }),
    );
  });

  it("sends the errors caught before the SDK loaded, with their source", async () => {
    const { sdk, capture } = fakeSdk();
    let resolve: (value: Sentry) => void = () => undefined;
    const reporter = createErrorReporter(
      options("https://k@h/1", () => new Promise((r) => (resolve = r))),
    );

    const early = new Error("before mount");
    reporter.report(early, { source: "global" });
    expect(capture).not.toHaveBeenCalled();

    resolve(sdk);
    await reporter.start();
    expect(capture).toHaveBeenNthCalledWith(1, early, { tags: { source: "global" } });

    const later = new Error("after");
    reporter.report(later, { source: "boundary" });
    expect(capture).toHaveBeenLastCalledWith(later, { tags: { source: "boundary" } });
  });

  it("gives up quietly when the SDK chunk cannot load", async () => {
    const reporter = createErrorReporter(
      options("https://k@h/1", () =>
        Promise.reject(new TypeError("Failed to fetch dynamically imported module")),
      ),
    );
    reporter.report(new Error("boom"), { source: "boundary" });
    expect(await reporter.start()).toBe(false);
  });
});

describe("what a report carries", () => {
  it("drops the person, cookies, headers, request body and query strings", async () => {
    const { beforeSend } = await startedHooks();
    const event = {
      message: "boom",
      user: { id: "u1", email: "jane@example.com", ip_address: "203.0.113.4" },
      request: {
        url: "https://names.trebeljahr.com/compare/?names=acme,zeta",
        headers: { Cookie: "session=secret", Authorization: "Bearer secret", "User-Agent": "UA" },
        cookies: "session=secret",
        data: { note: "secret" },
      },
      extra: { anything: "secret" },
    } as unknown as ErrorEvent;
    const sent = JSON.stringify(beforeSend(event, {}));
    expect(sent).not.toContain("secret");
    expect(sent).not.toContain("jane@example.com");
    expect(sent).not.toContain("acme");
    expect(sent).toContain('"url":"https://names.trebeljahr.com/compare/"');
    expect(sent).toContain('"release":"name-checker@0.1.0+abcdef012345"');
    expect(sent).toContain('"platform":"web"');
  });

  it("never carries a checked name, in the page address, a breadcrumb or a message", async () => {
    const { beforeSend, beforeBreadcrumb } = await startedHooks();
    const event = {
      message: "could not render /check/acme-secret/",
      exception: { values: [{ type: "Error", value: "failed at /passport/acme-secret" }] },
      request: { url: "https://names.trebeljahr.com/check/acme-secret/" },
      breadcrumbs: [
        { category: "navigation", data: { from: "/", to: "/check/acme-secret/" } },
        { category: "fetch", data: { method: "POST", status_code: 500, url: "/api/check/jobs" } },
        {
          category: "fetch",
          data: { method: "GET", status_code: 200, url: "/api/passport/status?query=acme-secret" },
        },
      ],
    } as unknown as ErrorEvent;
    const sent = beforeSend(event, {});
    expect(JSON.stringify(sent)).not.toContain("acme-secret");
    expect(sent?.request?.url).toBe("https://names.trebeljahr.com/check/_/");
    expect(sent?.breadcrumbs?.map((b) => b.data?.url ?? b.data?.to)).toEqual([
      "/check/_/",
      "/api/check/jobs",
      "/api/passport/status",
    ]);

    const crumb = beforeBreadcrumb({ category: "navigation", data: { from: "/check/x/", to: "/passport/y" } });
    expect(crumb?.data).toEqual({ from: "/check/_/", to: "/passport/_" });
    expect(beforeBreadcrumb({ category: "console", message: "/check/acme-secret" })).toBeNull();
  });
});

describe("releaseName", () => {
  it("is the version plus the short commit", () => {
    expect(releaseName("0.1.0", "0123456789abcdef0123")).toBe("name-checker@0.1.0+0123456789ab");
    expect(releaseName("0.1.0", "unknown")).toBe("name-checker@0.1.0");
    expect(releaseName("0.1.0", "")).toBe("name-checker@0.1.0");
    expect(releaseName("", "abc")).toBeUndefined();
  });
});
