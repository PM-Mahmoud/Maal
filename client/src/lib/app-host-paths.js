// client/src/lib/app-host-paths.js — pure path mapping for the optional
// app.<domain> subdomain (docs/app-subdomain.md). Plain ESM JavaScript (with a
// .d.ts beside it) so the root test suite can import it directly:
// test/app-host.test.js checks it against lib/app-host.js with one shared table.
//
// The React route tree keeps its '/app/...' paths. On the app host the router
// rewrites public '/billing' <-> internal '/app/billing'.

function norm(pathname) {
  const p = pathname == null ? "/" : String(pathname);
  return p.startsWith("/") ? p : "/" + p;
}

/** '/app' -> '/', '/app/x' -> '/x', anything else unchanged. */
export function stripAppPrefix(pathname) {
  const p = norm(pathname);
  if (p === "/app") return "/";
  if (p.startsWith("/app/")) return p.slice(4);
  return p;
}

export function isAppPath(pathname) {
  const p = norm(pathname);
  return p === "/app" || p.startsWith("/app/");
}

/** Public path on the app host -> internal router path. */
export function publicToInternal(pathname) {
  const p = norm(pathname);
  if (isAppPath(p)) return p;
  return p === "/" ? "/app" : "/app" + p;
}

/** Internal router path -> public path on the app host. */
export function internalToPublic(pathname) {
  return stripAppPrefix(pathname);
}
