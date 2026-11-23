'use strict';
// Deterministic tests for lib/app-routes.js — the route matching behind real
// 404 status codes (HEL-110). No database, no network, no build needed except
// the committed client/src/routeTree.gen.ts.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const r = require('../lib/app-routes');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { failed++; console.error(`  FAIL ${name}\n       ${e.message}`); }
}

const PATHS = ['/', '/subscribe', '/app', '/app/', '/app/goals', '/app/advisor/', '/app/advisor/$threadId',
  '/app/settings/profile', '/app/spending/reports', '/app/assets', '/docs/$'];
const compiled = r.compileRoutes(PATHS);

test('extractFullPaths reads the fullPaths union', () => {
  const src = `export interface FileRouteTypes {\n  fullPaths:\n    | '/'\n    | '/app/goals'\n    | '/app/advisor/$threadId'\n  fileRoutesByTo: FileRoutesByTo\n  to:\n    | '/not-a-full-path-entry'\n}`;
  assert.deepStrictEqual(r.extractFullPaths(src), ['/', '/app/advisor/$threadId', '/app/goals']);
});

test('extractFullPaths also reads fullPath: entries', () => {
  const src = `'/welcome': {\n id: '/welcome'\n fullPath: '/welcome'\n}`;
  assert.deepStrictEqual(r.extractFullPaths(src), ['/welcome']);
});

test('the real route tree yields the app routes', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'routeTree.gen.ts'), 'utf8');
  const paths = r.extractFullPaths(src);
  for (const p of ['/', '/app', '/app/goals', '/app/advisor/$threadId', '/app/settings/profile']) {
    assert.ok(paths.includes(p), `missing ${p}`);
  }
  assert.ok(!paths.some((p) => p.includes('_authenticated')), 'route ids must not leak into full paths');
});

test('static routes match exactly', () => {
  assert.strictEqual(r.matchRoute(compiled, '/app/goals'), '/app/goals');
  assert.strictEqual(r.matchRoute(compiled, '/app/settings/profile'), '/app/settings/profile');
  assert.strictEqual(r.matchRoute(compiled, '/'), '/');
  assert.strictEqual(r.matchRoute(compiled, '/app/goal'), null);
  assert.strictEqual(r.matchRoute(compiled, '/app/goals/extra'), null);
  assert.strictEqual(r.matchRoute(compiled, '/app/settings'), null);
});

test('trailing slashes, double slashes, query strings and case are ignored', () => {
  assert.ok(r.matchRoute(compiled, '/app/goals/'));
  assert.ok(r.matchRoute(compiled, '/app//goals'));
  assert.ok(r.matchRoute(compiled, '/app/goals?tab=2#x'));
  assert.ok(r.matchRoute(compiled, '/App/Goals'));
  assert.ok(r.matchRoute(compiled, '/app/'));
});

test('$param matches one non-empty segment', () => {
  assert.strictEqual(r.matchRoute(compiled, '/app/advisor/7b1c-42'), '/app/advisor/$threadId');
  assert.strictEqual(r.matchRoute(compiled, '/app/advisor/a%20b'), '/app/advisor/$threadId');
  assert.strictEqual(r.matchRoute(compiled, '/app/advisor/abc/def'), null);
  // "/app/advisor" alone is the index route, not a param match.
  assert.strictEqual(r.matchRoute(compiled, '/app/advisor'), '/app/advisor/');
});

test('$ splat matches the rest of the path', () => {
  assert.ok(r.matchRoute(compiled, '/docs'));
  assert.ok(r.matchRoute(compiled, '/docs/a/b/c'));
});

test('malformed percent-encoding does not throw', () => {
  assert.strictEqual(r.matchRoute(compiled, '/app/advisor/%E0%A4%A'), '/app/advisor/$threadId');
});

test('classifyRequest: known routes are spa, unknown split by /app', () => {
  assert.strictEqual(r.classifyRequest(compiled, '/app/goals'), 'spa');
  assert.strictEqual(r.classifyRequest(compiled, '/app/assets'), 'spa');
  assert.strictEqual(r.classifyRequest(compiled, '/app/assets/'), 'spa');
  assert.strictEqual(r.classifyRequest(compiled, '/app/does-not-exist'), 'spa-404');
  assert.strictEqual(r.classifyRequest(compiled, '/app/goals/nope/deeper'), 'spa-404');
  assert.strictEqual(r.classifyRequest(compiled, '/some-unknown-page'), 'public-404');
  assert.strictEqual(r.classifyRequest(compiled, '/apple'), 'public-404');
});

test('classifyRequest: missing files are assets, never the app page', () => {
  assert.strictEqual(r.classifyRequest(compiled, '/app/assets/index-missing.js'), 'asset');
  assert.strictEqual(r.classifyRequest(compiled, '/assets/chunk-404.css'), 'asset');
  assert.strictEqual(r.classifyRequest(compiled, '/images/nope.png'), 'asset');
  assert.strictEqual(r.classifyRequest(compiled, '/app/missing.svg'), 'asset');
  assert.strictEqual(r.classifyRequest(compiled, '/favicon.ico'), 'asset');
  assert.strictEqual(r.classifyRequest(null, '/app/assets/x.js'), 'asset');
});

test('isStaticAssetPath needs a file name after the folder', () => {
  assert.strictEqual(r.isStaticAssetPath('/app/assets/'), false);
  assert.strictEqual(r.isStaticAssetPath('/app/assets'), false);
  assert.strictEqual(r.isStaticAssetPath('/app/assets/a'), true);
  assert.strictEqual(r.isStaticAssetPath('/css/x.css?v=2'), true);
  assert.strictEqual(r.isStaticAssetPath('/admin/waitlist.csv'), false);
});

test('no manifest → everything that is not a file falls back to spa (200)', () => {
  assert.strictEqual(r.classifyRequest(null, '/app/does-not-exist'), 'spa');
  assert.strictEqual(r.classifyRequest(null, '/some-unknown-page'), 'spa');
});

test('loadRouteManifest: reads a manifest, logs once when missing', () => {
  r._resetWarned();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maal-routes-'));
  const good = path.join(dir, 'route-manifest.json');
  fs.writeFileSync(good, JSON.stringify({ paths: ['/app', '/app/goals'] }));
  const routes = r.loadRouteManifest(good, () => { throw new Error('should not log'); });
  assert.strictEqual(r.matchRoute(routes, '/app/goals'), '/app/goals');

  const logs = [];
  assert.strictEqual(r.loadRouteManifest(path.join(dir, 'missing.json'), (m) => logs.push(m)), null);
  assert.strictEqual(r.loadRouteManifest(path.join(dir, 'missing.json'), (m) => logs.push(m)), null);
  fs.writeFileSync(path.join(dir, 'empty.json'), '{"paths":[]}');
  assert.strictEqual(r.loadRouteManifest(path.join(dir, 'empty.json'), (m) => logs.push(m)), null);
  assert.strictEqual(logs.length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the committed manifest matches the route tree', () => {
  const file = path.join(__dirname, '..', 'public', 'app', 'route-manifest.json');
  if (!fs.existsSync(file)) return; // a fresh checkout before the client build
  const src = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'routeTree.gen.ts'), 'utf8');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).paths, r.extractFullPaths(src),
    'public/app/route-manifest.json is stale: rebuild the client');
});

console.log(`\napp-routes: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
