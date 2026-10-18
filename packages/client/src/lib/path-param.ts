/**
 * The `[query]` segment of a permalink such as `/check/<name>/`, read from
 * the address bar. The static export has one shell page per dynamic route
 * (`/check/_/`); the Worker serves it for every `/check/<name>` through a
 * `_redirects` proxy rule, so the name is only known in the browser.
 */
export function pathParam(pathname: string, prefix: string): string {
  const rest = pathname.startsWith(`/${prefix}/`)
    ? pathname.slice(prefix.length + 2)
    : "";
  const segment = rest.split("/")[0] ?? "";
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
