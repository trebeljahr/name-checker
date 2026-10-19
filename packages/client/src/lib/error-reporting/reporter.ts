import { BUILD_COMMIT } from "@/lib/build-identity";
import { redactBreadcrumbNames, redactEventNames } from "./redact-names";
import { scrubBreadcrumb, scrubEvent } from "./scrub";
import type * as Sdk from "./sdk";

/**
 * Error reports from the name-checker web client, to a Sentry-protocol
 * endpoint: the GlitchTip project `name-checker` on
 * glitchtip.trebeljahr.com.
 *
 * Follows hatchkit's generated reporter (cli/src/features/error-reporting
 * in hatchkit), with three changes: the release carries the build commit,
 * checked names are removed from every address (`redact-names.ts`), and
 * it uses the SDK 11 options: `dataCollection` instead of `sendDefaultPii`,
 * and no `console` flag on the breadcrumbs integration.
 * `scrub.ts` and `sdk.ts` are hatchkit's output unchanged. If a hatchkit
 * update ever rewrites this file, put the changes back:
 * `reporter.test.ts` fails until they are.
 *
 * Off unless this build has an endpoint. `NEXT_PUBLIC_SENTRY_DSN` is
 * inlined at build time, and `next.config.ts` gives it an empty fallback,
 * so the condition in front of the import below is a literal in every
 * build: without an endpoint the bundler folds it away and none of the SDK
 * is shipped. Empty means off, not "on with nowhere to send".
 *
 * Nothing here runs before the app mounts. The SDK arrives as a dynamic
 * import started from an effect, so it is in neither the exported HTML
 * nor the first chunks.
 *
 * What a report may carry is `scrub.ts`, and the privacy page
 * (app/privacy/page.tsx) states the same list in plain words. What this
 * file adds is the release and the platform, and nothing else.
 *
 * No tracing, no replay, no session tracking. Tracing makes the SDK add
 * `sentry-trace` and `baggage` headers to this app's own API requests,
 * which the API server does not expect. Replay records the screen, and
 * session tracking sends a ping on every page load. With none of them,
 * the SDK sends something only when an error happens.
 */

/** The SDK surface the reporter uses: the named re-exports in `sdk.ts`. */
type Sentry = typeof Sdk;

/** Where an error was caught. Sent as the `source` tag. */
export interface ReportContext {
  /** `boundary` is app/error.tsx, `global` is app/global-error.tsx. */
  source: "boundary" | "global" | "listener";
}

export interface ErrorReporter {
  /** Loads and starts the SDK once. Resolves false with no endpoint, or
   *  when the SDK chunk failed to load. */
  start(): Promise<boolean>;
  /** Reports one error. Does nothing in a build with no endpoint. */
  report(error: unknown, context: ReportContext): void;
}

export interface ErrorReporterOptions {
  dsn: string;
  /** Imports the SDK. Never called when `dsn` is empty. */
  load: () => Promise<Sentry>;
  release: string | undefined;
  environment: string;
  /** Read when the SDK starts, which is always after mount. */
  platform: () => ReportingPlatform;
}

/** Errors held while the SDK loads. An error thrown during startup is
 *  the one most likely to matter, so a few are kept rather than lost. */
const MAX_PENDING = 20;

/**
 * `name-checker@<version>+<commit>`, the release every event is tagged
 * with. The version never changes between deploys; the commit is what
 * tells two builds apart. A local build has no commit and reports the
 * bare version.
 */
export function releaseName(version: string, commit: string): string | undefined {
  if (!version) return undefined;
  const build = commit === "unknown" ? "" : commit.trim().slice(0, 12);
  return build ? `name-checker@${version}+${build}` : `name-checker@${version}`;
}

/** The release every event from this build is tagged with. */
export const RELEASE = releaseName("0.1.0", BUILD_COMMIT);

/** A host this build can run on. Fixed by the build, not by the device. */
export type ReportingPlatform = "web";

/** This build is for the browser only, so there is nothing to detect. */
export function reportingPlatform(): ReportingPlatform {
  return "web";
}

export function createErrorReporter(options: ErrorReporterOptions): ErrorReporter {
  let started: Promise<boolean> | null = null;
  let sdk: Sentry | null = null;
  let pending: Array<{ error: unknown; context: ReportContext }> = [];

  const capture = (client: Sentry, error: unknown, context: ReportContext): void => {
    client.captureException(error, { tags: { source: context.source } });
  };

  const start = (): Promise<boolean> => {
    if (!options.dsn) return Promise.resolve(false);
    started ??= options
      .load()
      .then((client) => {
        const platform = options.platform();
        client.init({
          dsn: options.dsn,
          release: options.release,
          environment: options.environment,
          // SDK 11 replaced `sendDefaultPii` with this list, and its
          // defaults collect everything. Each entry is off here, and
          // `scrubEvent` removes the same things again in `beforeSend`.
          // The user agent stays: it is the browser and OS of a report.
          dataCollection: {
            userInfo: false,
            cookies: false,
            httpHeaders: { request: { allow: ["User-Agent"] }, response: false },
            httpBodies: [],
            urlQueryParams: false,
            stackFrameVariables: false,
          },
          sendClientReports: false,
          // The list replaces the SDK's defaults rather than adding to
          // them, which is what leaves out the ping on every page load,
          // the culture context, and the console breadcrumbs (SDK 11 moved
          // those to `consoleIntegration`, which is not in this list).
          defaultIntegrations: false,
          integrations: [
            client.eventFiltersIntegration(),
            client.functionToStringIntegration(),
            client.browserApiErrorsIntegration(),
            client.breadcrumbsIntegration({
              dom: false,
              sentry: false,
              fetch: true,
              xhr: true,
              history: true,
            }),
            client.globalHandlersIntegration(),
            client.linkedErrorsIntegration(),
            client.dedupeIntegration(),
            client.httpContextIntegration(),
          ],
          maxBreadcrumbs: 30,
          // Dropped here as well as in beforeSend, so a breadcrumb that
          // may not be sent is never even stored.
          beforeBreadcrumb: (breadcrumb) => {
            const kept = scrubBreadcrumb(breadcrumb);
            return kept ? redactBreadcrumbNames(kept) : null;
          },
          beforeSend: (event) =>
            redactEventNames(scrubEvent(event, { release: options.release, platform })),
          initialScope: { tags: { platform } },
        });
        sdk = client;
        const held = pending;
        pending = [];
        for (const item of held) capture(client, item.error, item.context);
        return true;
      })
      .catch(() => {
        // The SDK chunk itself failed to load: offline, or a deploy
        // removed it. Caught here so it never travels on as an error of
        // the app's own.
        pending = [];
        return false;
      });
    return started;
  };

  return {
    start,
    report(error, context) {
      if (!options.dsn) return;
      if (sdk) {
        capture(sdk, error, context);
        return;
      }
      if (pending.length < MAX_PENDING) pending.push({ error, context });
      void start();
    },
  };
}

/**
 * The SDK import, inside a condition on the inlined variable in the same
 * expression. With no endpoint the condition is the literal "", the
 * bundler folds the import away, and the SDK is not in the build at all.
 * The import names `./sdk`, not the package, so the chunk built when
 * there is an endpoint holds only what the reporter uses.
 */
const loadSdk = (): Promise<Sentry> =>
  process.env.NEXT_PUBLIC_SENTRY_DSN
    ? import("./sdk")
    : Promise.reject(new Error("error reporting is not configured"));

const reporter = createErrorReporter({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
  load: loadSdk,
  release: RELEASE,
  environment: process.env.NODE_ENV ?? "development",
  platform: reportingPlatform,
});

/** Starts reporting, if this build has an endpoint. Call it from an
 *  effect — never during render, and never at module scope. */
export const startErrorReporting = (): Promise<boolean> => reporter.start();

/** Reports an error an error boundary or a listener caught. Does nothing
 *  in a build with no endpoint. */
export const reportClientError = (error: unknown, context: ReportContext): void =>
  reporter.report(error, context);
