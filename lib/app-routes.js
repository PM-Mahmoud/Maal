'use strict';
// Real 404 status codes for the React SPA and static files (HEL-110).
//
// Express can't see the client's routes, so the client build writes a manifest
// of every TanStack Router full path (scripts/build-route-manifest.js reads
// client/src/routeTree.gen.ts → public/app/route-manifest.json). The SPA
// catch-all in server.js uses classifyRequest() to decide between:
//   'asset'      — a file-like path no static mount found → plain 404
//   'spa'        — a known client route → app shell, 200
//   'spa-404'    — an unknown /app/* path → app shell with status 404 (the
//                  React router renders its not-found page)
//   'public-404' — an unknown public path → server-rendered not-found page, 404
// Without a manifest every non-asset path falls back to 'spa' (the old
// behaviour, status 200) and the server logs it once.
//
// Pure apart from loadRouteManifest(); test/app-routes.test.js covers it.

const fs = require('fs');

// Folders under public/ that only ever hold files. Anything below them that the
// static mounts didn't serve is a missing file, never a page. Mounted before
// the session middleware (lib/static-assets.js), so missing chunks cost no DB.
const ASSET_PREFIXES = ['/app/assets/', '/assets/', '/app/images/', '/images/', '/css/', '/js/'];

// A last path segment with a file extension (".js", ".png", ".map", …).
const FILE_EXT = /\.[a-z0-9]{1,10}$/i;

function pathOnly(url) {
  const s = String(url || '/');
  const q = s.search(/[?#]/);
  return q === -1 ? s : s.slice(0, q);
}

/** True for a path inside a files-only folder (with a file name after it). */
function isStaticAssetPath(url) {
  const p = pathOnly(url);
  return ASSET_PREFIXES.some((pre) => p.startsWith(pre) && p.length > pre.length);
}

/** True when the last segment looks like a file name. */
function looksLikeFile(url) {
  const p = pathOnly(url);
  const last = p.slice(p.lastIndexOf('/') + 1);
  return FILE_EXT.test(last);
}

/**
 * Every full path in a TanStack Router generated route tree, e.g. '/app',
 * '/app/advisor/$threadId'. Reads the `fullPaths:` union and every
 * `fullPath: '…'` entry, so either shape on its own is enough.
 */
function extractFullPaths(source) {
  const src = String(source || '');
  const out = new Set();
  const union = src.match(/fullPaths:([\s\S]*?)\n\s*fileRoutesByTo/);
  if (union) for (const m of union[1].matchAll(/'([^']+)'/g)) out.add(m[1]);
  for (const m of src.matchAll(/fullPath:\s*'([^']+)'/g)) out.add(m[1]);
  return [...out].filter((p) => p.startsWith('/')).sort();
}

function splitPath(p) {
  return p.split('/').filter(Boolean);
}

function normalisePath(url) {
  let p = pathOnly(url);
  if (!p.startsWith('/')) p = '/' + p;
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p;
}

function decodeSegment(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

/**
 * Compile route patterns once. Segment kinds:
 *   'app'    — literal (matched case-insensitively, like TanStack's default)
 *   '$id'    — one non-empty dynamic segment
 *   '$'      — splat: the rest of the path (zero or more segments)
 *   '{…}'    — any other TanStack syntax: treated as one dynamic segment
 */
function compileRoutes(paths) {
  return (paths || []).map((raw) => {
    const segs = splitPath(normalisePath(raw)).map((s) => {
      if (s === '$') return { kind: 'splat' };
      if (s.startsWith('$') || s.includes('{')) return { kind: 'param' };
      return { kind: 'literal', value: s.toLowerCase() };
    });
    return { raw, segs };
  });
}

function matchOne(route, parts) {
  const { segs } = route;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.kind === 'splat') return true;
    if (i >= parts.length) return false;
    if (seg.kind === 'param') { if (!parts[i]) return false; continue; }
    if (seg.value !== parts[i].toLowerCase()) return false;
  }
  return segs.length === parts.length;
}

/** The first route pattern a URL path matches, or null. */
function matchRoute(compiled, url) {
  const parts = splitPath(normalisePath(url)).map(decodeSegment);
  for (const route of compiled || []) {
    if (matchOne(route, parts)) return route.raw;
  }
  return null;
}

function isAppPath(url) {
  const p = normalisePath(url);
  return p === '/app' || p.startsWith('/app/');
}

/**
 * Decide how the SPA catch-all answers a request (see the header comment).
 * `compiled` is compileRoutes(manifest) or null when there is no manifest.
 */
function classifyRequest(compiled, url) {
  if (isStaticAssetPath(url) || looksLikeFile(url)) return 'asset';
  if (!compiled) return 'spa';
  if (matchRoute(compiled, url)) return 'spa';
  return isAppPath(url) ? 'spa-404' : 'public-404';
}

/**
 * Read public/app/route-manifest.json → compiled routes, or null when it is
 * missing or unreadable (logged once per process via `log`).
 */
let warned = false;
function loadRouteManifest(file, log = console.warn) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const paths = Array.isArray(data) ? data : data && data.paths;
    if (!Array.isArray(paths) || !paths.length) throw new Error('no paths in manifest');
    return compileRoutes(paths);
  } catch (e) {
    if (!warned) {
      warned = true;
      log(`[routes] No usable route manifest at ${file} (${e.code || e.message}); unknown pages will return 200 until the client is rebuilt.`);
    }
    return null;
  }
}

module.exports = {
  ASSET_PREFIXES,
  isStaticAssetPath,
  looksLikeFile,
  extractFullPaths,
  normalisePath,
  compileRoutes,
  matchRoute,
  isAppPath,
  classifyRequest,
  loadRouteManifest,
  _resetWarned: () => { warned = false; },
};
