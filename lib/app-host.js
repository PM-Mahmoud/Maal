// lib/app-host.js — optional app.<domain> subdomain for the React app.
//
// Today the authenticated React app lives at <site>/app/* on the same host as
// the marketing site. Setting APP_HOST (e.g. "app.hellomaal.com") moves it to
// its own host, served at "/" there. With APP_HOST UNSET every function here
// returns exactly what the code did before (relative "/app..." paths, no cookie
// domain, default cookie name) — the flag is the only switch.
//
// Pure: every function takes `env` (defaults to process.env) and does no I/O,
// so test/app-host.test.js can pin the behaviour deterministically.
//
// Env:
//   APP_HOST               — hostname (optionally :port) of the app, no scheme.
//                            Unset/blank/invalid = feature off.
//   BASE_URL               — the marketing site origin (e.g. https://www.hellomaal.com).
//                            Marketing/auth paths requested on APP_HOST are
//                            redirected here.
//   SESSION_COOKIE_DOMAIN  — e.g. ".hellomaal.com" so one login works on both
//                            hosts. Unset = host-only cookie (current behaviour).
//   SESSION_COOKIE_NAME    — optional override. Defaults to "connect.sid", or
//                            "maal.sid" once SESSION_COOKIE_DOMAIN is set (see
//                            sessionCookieConfig for why).
//
// The client mirrors the path mapping in client/src/lib/app-host-paths.js; the
// test checks both against the same table so they cannot drift.

'use strict';

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/;

// Normalised APP_HOST ("app.hellomaal.com"), or '' when the feature is off.
// Tolerates a pasted scheme / trailing slash; anything else odd disables the
// feature rather than producing a broken redirect (the value is also injected
// into HTML, so it must stay in a safe character set).
function appHost(env = process.env) {
  let h = String((env && env.APP_HOST) || '').trim().toLowerCase();
  h = h.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return HOST_RE.test(h) ? h : '';
}

function isEnabled(env = process.env) {
  return appHost(env) !== '';
}

function stripPort(host) {
  return String(host || '').toLowerCase().replace(/:\d+$/, '');
}

// Local dev hosts (app.localhost:3000) are plain http; everything else https.
function protocolFor(host) {
  const bare = stripPort(host);
  return (bare === 'localhost' || bare.endsWith('.localhost') || bare === '127.0.0.1') ? 'http' : 'https';
}

function appOrigin(env = process.env) {
  const h = appHost(env);
  return h ? `${protocolFor(h)}://${h}` : '';
}

// Marketing-site origin from BASE_URL ('' if unset).
function siteOrigin(env = process.env) {
  return String((env && env.BASE_URL) || '').trim().replace(/\/+$/, '');
}

function isAppHostRequest(hostname, env = process.env) {
  const h = appHost(env);
  return !!h && stripPort(hostname) === stripPort(h);
}

function normalisePath(path) {
  const p = String(path == null ? '/' : path);
  return p.startsWith('/') ? p : '/' + p;
}

// URL of an app page. `path` is relative to the app root: '/', '/billing',
// '/assets?lunchflow=connected'.
//   flag off: '/app' + path            ('/' → '/app')   — exactly today's strings
//   flag on : 'https://APP_HOST' + path
// opts.absolute (emails, Stripe): flag off prefixes BASE_URL (default
// https://hellomaal.com, matching services/email.js).
function appUrl(path = '/', opts = {}, env = process.env) {
  const p = normalisePath(path);
  const origin = appOrigin(env);
  if (origin) return origin + p;
  const rel = p === '/' ? '/app' : (p.startsWith('/?') || p.startsWith('/#') ? '/app' + p.slice(1) : '/app' + p);
  if (!opts.absolute) return rel;
  const base = siteOrigin(env) || 'https://hellomaal.com';
  return base + rel;
}

// ─── Path mapping between the public URL and the React router's internal one ──
// The React route tree keeps its '/app/...' paths; on APP_HOST the router maps
// public '/billing' ↔ internal '/app/billing'. Mirrored in the client.

// '/app' → '/', '/app/x' → '/x', anything else unchanged.
function stripAppPrefix(pathname) {
  const p = normalisePath(pathname);
  if (p === '/app') return '/';
  if (p.startsWith('/app/')) return p.slice(4);
  return p;
}

function isAppPath(pathname) {
  const p = normalisePath(pathname);
  return p === '/app' || p.startsWith('/app/');
}

// Public path on APP_HOST → internal router path.
function publicToInternal(pathname) {
  const p = normalisePath(pathname);
  if (isAppPath(p)) return p;
  return p === '/' ? '/app' : '/app' + p;
}

// Internal router path → public path on APP_HOST.
function internalToPublic(pathname) {
  return stripAppPrefix(pathname);
}

// ─── Host-based redirects (Express middleware decision) ──────────────────────

// Paths that belong to the marketing site or the auth surface. Requested on
// APP_HOST they are sent to the site, so login/OAuth keep running on one host
// (one Google redirect URI) and marketing pages are not duplicated for SEO.
const SITE_PREFIXES = [
  '/pricing', '/about', '/security', '/contact', '/waitlist',
  '/financial-wellbeing-score', '/score',
  '/login', '/signup', '/forgot-password', '/reset-password', '/verify-email',
  '/auth', '/welcome', '/admin', '/r/',
];

function matchesPrefix(path, prefix) {
  if (prefix.endsWith('/')) return path.startsWith(prefix);
  return path === prefix || path.startsWith(prefix + '/');
}

function isSitePath(path) {
  const p = normalisePath(path);
  return SITE_PREFIXES.some((pre) => matchesPrefix(p, pre));
}

// Decide whether a request must be redirected because of APP_HOST.
// Returns { status, location } or null (carry on). Only GET/HEAD redirect —
// form posts and API calls are never bounced.
function hostRedirect({ hostname, path, originalUrl, method = 'GET' }, env = process.env) {
  if (!isEnabled(env)) return null;
  if (method !== 'GET' && method !== 'HEAD') return null;
  const p = normalisePath(path);
  const url = String(originalUrl || p);
  const qIdx = url.indexOf('?');
  const query = qIdx >= 0 ? url.slice(qIdx) : '';

  if (isAppHostRequest(hostname, env)) {
    // Old-style /app links on the app host → canonical prefix-less path.
    if (isAppPath(p)) return { status: 301, location: stripAppPrefix(p) + query };
    const site = siteOrigin(env);
    if (site && isSitePath(p)) return { status: 301, location: site + url };
    return null;
  }
  // Any other host (the marketing site): /app/* moves to the app host.
  if (isAppPath(p)) return { status: 301, location: appOrigin(env) + stripAppPrefix(p) + query };
  return null;
}

// On APP_HOST these public paths are React pages, but an Express router of the
// same name is mounted earlier (/billing, /onboarding). server.js serves the
// SPA for exactly these before the routers see them.
const APP_PATHS_SHADOWED_BY_ROUTERS = ['/billing', '/onboarding'];

function isShadowedAppPath(path) {
  const p = normalisePath(path).replace(/\/+$/, '') || '/';
  return APP_PATHS_SHADOWED_BY_ROUTERS.includes(p);
}

// ─── Session cookie ───────────────────────────────────────────────────────────
// With SESSION_COOKIE_DOMAIN unset this is exactly today's cookie.
// When a domain is set the default NAME changes too: browsers would otherwise
// keep the old host-only "connect.sid" alongside the new domain-wide one, send
// both, and express-session reads the first — a stale, destroyed session after
// the next logout/login, i.e. a login loop. A new name avoids the clash at the
// cost of one forced re-login when the switch goes live.
function sessionCookieConfig(env = process.env) {
  const domain = String((env && env.SESSION_COOKIE_DOMAIN) || '').trim();
  const nameOverride = String((env && env.SESSION_COOKIE_NAME) || '').trim();
  const name = nameOverride || (domain ? 'maal.sid' : 'connect.sid');
  return domain ? { name, domain } : { name };
}

// HTML snippet injected into the SPA's index.html <head> so the client knows
// where the app lives. '' when the feature is off (index.html served untouched).
// The site origin goes in too (when BASE_URL is a valid http(s) origin) so the
// app host can send non-app navigations — e.g. "home" after sign-out — back to
// the marketing site.
function indexHtmlMeta(env = process.env) {
  const h = appHost(env);
  if (!h) return '';
  let meta = `<meta name="maal-app-host" content="${h}">`;
  try {
    const u = new URL(siteOrigin(env));
    if ((u.protocol === 'https:' || u.protocol === 'http:') && HOST_RE.test(u.host)) {
      meta += `<meta name="maal-site-origin" content="${u.protocol}//${u.host}">`;
    }
  } catch { /* BASE_URL unset or invalid: app host keeps non-app paths local */ }
  return meta;
}

function injectIntoIndexHtml(html, env = process.env) {
  const meta = indexHtmlMeta(env);
  if (!meta) return html;
  const s = String(html);
  return s.includes('</head>') ? s.replace('</head>', `${meta}</head>`) : meta + s;
}

module.exports = {
  appHost,
  isEnabled,
  appOrigin,
  siteOrigin,
  isAppHostRequest,
  appUrl,
  stripAppPrefix,
  isAppPath,
  publicToInternal,
  internalToPublic,
  isSitePath,
  hostRedirect,
  isShadowedAppPath,
  sessionCookieConfig,
  indexHtmlMeta,
  injectIntoIndexHtml,
  SITE_PREFIXES,
};
