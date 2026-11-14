// client/src/lib/app-host.ts — runtime wiring for the optional app subdomain
// (docs/app-subdomain.md).
//
// The server injects <meta name="maal-app-host" content="app.example.com">
// into index.html ONLY when APP_HOST is set. No meta tag => every export here
// is inert and the router behaves exactly as before.
//
//   On the app host:  public '/billing' <-> internal '/app/billing'.
//   On the site host: internal '/app/...' navigations leave for the app host
//                     (TanStack treats a cross-origin rewrite as a full page load).
import type { AnyRouter, LocationRewrite } from "@tanstack/react-router";
import { internalToPublic, isAppPath, publicToInternal } from "./app-host-paths";

function readAppHost(): string {
  if (typeof document === "undefined") return "";
  const el = document.querySelector('meta[name="maal-app-host"]');
  const v = (el?.getAttribute("content") || "").trim().toLowerCase();
  return /^[a-z0-9.-]+(:\d+)?$/.test(v) ? v : "";
}

const APP_HOST = readAppHost();

function readSiteOrigin(): string {
  if (typeof document === "undefined") return "";
  const v = (document.querySelector('meta[name="maal-site-origin"]')?.getAttribute("content") || "").trim();
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : "";
  } catch {
    return "";
  }
}

const SITE_ORIGIN = readSiteOrigin();

export function onAppHost(): boolean {
  return !!APP_HOST && typeof window !== "undefined" && window.location.host.toLowerCase() === APP_HOST;
}

/** True when the current page is part of the authenticated app (either layout). */
export function inAppArea(): boolean {
  if (typeof window === "undefined") return false;
  return onAppHost() || isAppPath(window.location.pathname);
}

export function appHostRewrite(): LocationRewrite | undefined {
  if (!APP_HOST || typeof window === "undefined") return undefined;
  if (onAppHost()) {
    return {
      input: ({ url }) => {
        url.pathname = publicToInternal(url.pathname);
        return url;
      },
      output: ({ url }) => {
        // Non-app routes (the homepage after sign-out, /welcome) live on the
        // marketing site: a cross-origin URL makes the router do a full load.
        if (!isAppPath(url.pathname) && SITE_ORIGIN) {
          return new URL(url.pathname + url.search + url.hash, SITE_ORIGIN);
        }
        url.pathname = internalToPublic(url.pathname);
        return url;
      },
    };
  }
  const appOrigin = `${window.location.protocol}//${APP_HOST}`;
  return {
    output: ({ url }) => {
      if (!isAppPath(url.pathname)) return undefined;
      return new URL(internalToPublic(url.pathname) + url.search + url.hash, appOrigin);
    },
  };
}

/**
 * <Link> already turns a cross-origin rewrite into a normal page load, but
 * programmatic navigate() would try history.pushState() with another origin,
 * which the browser rejects. Send those through reloadDocument instead (e.g.
 * finishing /welcome on the site, or "home" after sign-out on the app host).
 * Only called when appHostRewrite() returned a rewrite.
 */
export function guardCrossOriginNavigation(router: AnyRouter): void {
  const original = router.navigate.bind(router);
  router.navigate = ((opts: Parameters<AnyRouter["navigate"]>[0]) => {
    if (opts && !opts.href && !opts.reloadDocument) {
      try {
        if (router.buildLocation(opts as never).external) {
          return original({ ...opts, reloadDocument: true });
        }
      } catch {
        /* fall through to the normal navigation */
      }
    }
    return original(opts);
  }) as AnyRouter["navigate"];
}
