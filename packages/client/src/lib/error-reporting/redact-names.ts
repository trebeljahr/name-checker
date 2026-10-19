import type { Breadcrumb, ErrorEvent } from "@sentry/browser";

/**
 * The names people check, taken out of an error report.
 *
 * `scrub.ts` (hatchkit's allowlist) already removes every query string,
 * which is where the API calls carry a name (`/api/variants?q=`,
 * `/api/passport/status?query=`). The permalinks carry it in the path
 * instead: `/check/<name>/` and `/passport/<name>/`. A name someone has not
 * announced yet is the one thing this site must not pass on, so the
 * segment after those prefixes becomes `_` — the shell page the Worker
 * serves for every name — wherever a page address appears in a report.
 *
 * Runs after `scrubEvent`, so only what the allowlist kept is left to look at.
 */

/**
 * A `/check/<name>` or `/passport/<name>` page segment, inside a longer text
 * or a URL. Not `/api/check/jobs` or `/api/passport/status`: those name an
 * endpoint, not a name, and say which call failed.
 */
const NAME_SEGMENT = /(?<!\/api)(\/(?:check|passport)\/)(?!_(?:[/?#\s"'<>]|$))[^/?#\s"'<>]+/g;

/** A text or URL with every checked name replaced by `_`. */
export function redactNames(text: string): string {
  return text.replace(NAME_SEGMENT, "$1_");
}

/** One breadcrumb with checked names removed from its addresses. Mutates and returns it. */
export function redactBreadcrumbNames(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data;
  if (data) {
    for (const key of ["from", "to", "url"] as const) {
      const value = data[key];
      if (typeof value === "string") data[key] = redactNames(value);
    }
  }
  if (typeof breadcrumb.message === "string") breadcrumb.message = redactNames(breadcrumb.message);
  return breadcrumb;
}

/** An event with checked names removed from every address and message. Mutates and returns it. */
export function redactEventNames(event: ErrorEvent): ErrorEvent {
  if (event.request?.url) event.request.url = redactNames(event.request.url);
  if (typeof event.message === "string") event.message = redactNames(event.message);
  if (typeof event.logentry?.message === "string") {
    event.logentry.message = redactNames(event.logentry.message);
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactNames(exception.value);
  }
  for (const breadcrumb of event.breadcrumbs ?? []) redactBreadcrumbNames(breadcrumb);
  return event;
}
