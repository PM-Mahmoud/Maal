'use strict';
// Deterministic tests for lib/app-host.js (optional app.<domain> subdomain,
// docs/app-subdomain.md) and its client mirror client/src/lib/app-host-paths.js.
// The key guarantee: with APP_HOST unset every helper returns exactly the
// strings the code used before the flag existed.

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const h = require('../lib/app-host');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

const OFF = { BASE_URL: 'https://www.hellomaal.com' };
const ON = { APP_HOST: 'app.hellomaal.com', BASE_URL: 'https://www.hellomaal.com' };

// Shared table: [public path on app host, internal router path]
const PATH_TABLE = [
  ['/', '/app'],
  ['/billing', '/app/billing'],
  ['/advisor/abc-123', '/app/advisor/abc-123'],
  ['/wealth/super', '/app/wealth/super'],
  ['/assets', '/app/assets'],
];

(async () => {
  console.log('\napp host (APP_HOST subdomain)');

  await test('flag is off when APP_HOST is unset, blank or malformed', () => {
    for (const env of [{}, { APP_HOST: '' }, { APP_HOST: '   ' }, { APP_HOST: 'bad host' },
      { APP_HOST: 'x"><script>' }, { APP_HOST: 'app.hellomaal.com/path' }]) {
      assert.strictEqual(h.isEnabled(env), false, JSON.stringify(env));
      assert.strictEqual(h.appHost(env), '');
    }
  });

  await test('APP_HOST is normalised (case, pasted scheme, trailing slash)', () => {
    assert.strictEqual(h.appHost({ APP_HOST: 'App.HelloMaal.com' }), 'app.hellomaal.com');
    assert.strictEqual(h.appHost({ APP_HOST: 'https://app.hellomaal.com/' }), 'app.hellomaal.com');
    assert.strictEqual(h.appHost({ APP_HOST: 'app.localhost:3000' }), 'app.localhost:3000');
    assert.strictEqual(h.appOrigin({ APP_HOST: 'app.localhost:3000' }), 'http://app.localhost:3000');
    assert.strictEqual(h.appOrigin(ON), 'https://app.hellomaal.com');
  });

  await test('appUrl with the flag OFF returns the exact pre-flag strings', () => {
    assert.strictEqual(h.appUrl('/', {}, OFF), '/app');
    assert.strictEqual(h.appUrl('/billing', {}, OFF), '/app/billing');
    assert.strictEqual(h.appUrl('/billing?billing=error', {}, OFF), '/app/billing?billing=error');
    assert.strictEqual(h.appUrl('/assets?lunchflow=connected', {}, OFF), '/app/assets?lunchflow=connected');
    assert.strictEqual(h.appUrl('/portfolio-plan', {}, OFF), '/app/portfolio-plan');
    assert.strictEqual(h.appUrl('/?x=1', {}, OFF), '/app?x=1');
    // Absolute (emails, Stripe cancel_url): BASE_URL + '/app...'
    assert.strictEqual(h.appUrl('/', { absolute: true }, OFF), 'https://www.hellomaal.com/app');
    assert.strictEqual(h.appUrl('/research', { absolute: true }, OFF), 'https://www.hellomaal.com/app/research');
    assert.strictEqual(h.appUrl('/billing?billing=cancel', { absolute: true }, { BASE_URL: 'https://x.test/' }),
      'https://x.test/app/billing?billing=cancel');
    // services/email.js default when BASE_URL is unset
    assert.strictEqual(h.appUrl('/', { absolute: true }, {}), 'https://hellomaal.com/app');
  });

  await test('appUrl with the flag ON points at the app host root', () => {
    assert.strictEqual(h.appUrl('/', {}, ON), 'https://app.hellomaal.com/');
    assert.strictEqual(h.appUrl('/billing?billing=success&plan=member', {}, ON),
      'https://app.hellomaal.com/billing?billing=success&plan=member');
    assert.strictEqual(h.appUrl('/research', { absolute: true }, ON), 'https://app.hellomaal.com/research');
  });

  await test('hostRedirect does nothing at all with the flag OFF', () => {
    for (const p of ['/app', '/app/billing', '/login', '/pricing', '/', '/billing']) {
      assert.strictEqual(h.hostRedirect({ hostname: 'www.hellomaal.com', path: p, originalUrl: p }, OFF), null);
      assert.strictEqual(h.hostRedirect({ hostname: 'app.hellomaal.com', path: p, originalUrl: p }, OFF), null);
    }
  });

  await test('site host: /app/* 301s to the app host, keeping the query', () => {
    const r = (p, u) => h.hostRedirect({ hostname: 'www.hellomaal.com', path: p, originalUrl: u || p }, ON);
    assert.deepStrictEqual(r('/app'), { status: 301, location: 'https://app.hellomaal.com/' });
    assert.deepStrictEqual(r('/app/'), { status: 301, location: 'https://app.hellomaal.com/' });
    assert.deepStrictEqual(r('/app/billing', '/app/billing?billing=cancel'),
      { status: 301, location: 'https://app.hellomaal.com/billing?billing=cancel' });
    // Everything else on the site is left alone
    for (const p of ['/', '/pricing', '/login', '/welcome', '/billing/success', '/api/me', '/apple', '/application']) {
      assert.strictEqual(r(p), null, p);
    }
  });

  await test('app host: /app/* is canonicalised; site and auth paths go to the site', () => {
    const r = (p, u, method) => h.hostRedirect({ hostname: 'app.hellomaal.com', path: p, originalUrl: u || p, method }, ON);
    assert.deepStrictEqual(r('/app/vault', '/app/vault?x=1'), { status: 301, location: '/vault?x=1' });
    assert.deepStrictEqual(r('/app'), { status: 301, location: '/' });
    assert.deepStrictEqual(r('/login', '/login?redirect=/app'),
      { status: 301, location: 'https://www.hellomaal.com/login?redirect=/app' });
    for (const p of ['/pricing', '/signup', '/auth/google', '/welcome', '/score', '/r/abc', '/contact']) {
      assert.strictEqual(r(p).location, 'https://www.hellomaal.com' + p, p);
    }
    // App pages, APIs and server callbacks stay on the app host
    for (const p of ['/', '/billing', '/billing/success', '/onboarding', '/scenarios-simulator',
      '/api/me', '/basiq/connect', '/lunchflow/callback', '/assets/index-abc.js', '/health', '/logout']) {
      assert.strictEqual(r(p), null, p);
    }
    // Posts are never bounced
    assert.strictEqual(r('/login', '/login', 'POST'), null);
    assert.strictEqual(r('/app/billing', '/app/billing', 'POST'), null);
  });

  await test('app host without BASE_URL keeps site paths local (no broken redirect)', () => {
    const env = { APP_HOST: 'app.hellomaal.com' };
    assert.strictEqual(h.hostRedirect({ hostname: 'app.hellomaal.com', path: '/login' }, env), null);
  });

  await test('host matching ignores port and case', () => {
    assert.strictEqual(h.isAppHostRequest('APP.hellomaal.com', ON), true);
    assert.strictEqual(h.isAppHostRequest('app.localhost', { APP_HOST: 'app.localhost:3000' }), true);
    assert.strictEqual(h.isAppHostRequest('www.hellomaal.com', ON), false);
    assert.strictEqual(h.isAppHostRequest('app.hellomaal.com', OFF), false);
  });

  await test('only /billing and /onboarding are shadowed by Express routers', () => {
    assert.strictEqual(h.isShadowedAppPath('/billing'), true);
    assert.strictEqual(h.isShadowedAppPath('/billing/'), true);
    assert.strictEqual(h.isShadowedAppPath('/onboarding'), true);
    assert.strictEqual(h.isShadowedAppPath('/billing/success'), false);
    assert.strictEqual(h.isShadowedAppPath('/vault'), false);
  });

  await test('session cookie: unchanged by default, renamed when a domain is set', () => {
    assert.deepStrictEqual(h.sessionCookieConfig({}), { name: 'connect.sid' });
    assert.deepStrictEqual(h.sessionCookieConfig({ SESSION_COOKIE_DOMAIN: '.hellomaal.com' }),
      { name: 'maal.sid', domain: '.hellomaal.com' });
    assert.deepStrictEqual(h.sessionCookieConfig({ SESSION_COOKIE_DOMAIN: '.hellomaal.com', SESSION_COOKIE_NAME: 'connect.sid' }),
      { name: 'connect.sid', domain: '.hellomaal.com' });
  });

  await test('index.html is untouched with the flag OFF; gets meta tags with it ON', () => {
    const html = '<html><head><title>x</title></head><body></body></html>';
    assert.strictEqual(h.injectIntoIndexHtml(html, OFF), html);
    const out = h.injectIntoIndexHtml(html, ON);
    assert.ok(out.includes('<meta name="maal-app-host" content="app.hellomaal.com">'));
    assert.ok(out.includes('<meta name="maal-site-origin" content="https://www.hellomaal.com">'));
    assert.ok(out.indexOf('maal-app-host') < out.indexOf('</head>'));
    // A hostile BASE_URL never reaches the page
    const evil = h.injectIntoIndexHtml(html, { APP_HOST: 'app.hellomaal.com', BASE_URL: 'javascript:alert(1)' });
    assert.ok(!evil.includes('maal-site-origin'));
  });

  await test('server and client path mappings agree on the shared table', async () => {
    const client = await import(pathToFileURL(path.join(__dirname, '..', 'client', 'src', 'lib', 'app-host-paths.js')).href);
    for (const [pub, internal] of PATH_TABLE) {
      assert.strictEqual(h.publicToInternal(pub), internal, `server in ${pub}`);
      assert.strictEqual(client.publicToInternal(pub), internal, `client in ${pub}`);
      assert.strictEqual(h.internalToPublic(internal), pub, `server out ${internal}`);
      assert.strictEqual(client.internalToPublic(internal), pub, `client out ${internal}`);
      // Already-internal paths are not double-prefixed
      assert.strictEqual(h.publicToInternal(internal), internal);
      assert.strictEqual(client.publicToInternal(internal), internal);
    }
    for (const p of ['/app', '/app/x', '/apple', '/', '/welcome']) {
      assert.strictEqual(client.isAppPath(p), h.isAppPath(p), p);
      assert.strictEqual(client.stripAppPrefix(p), h.stripAppPrefix(p), p);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
