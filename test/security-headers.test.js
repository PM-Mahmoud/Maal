'use strict';
// Deterministic tests for lib/security-headers.js (the exact config server.js
// applies). Loopback server only; no database or network.
//  - enforced CSP keeps its allowlist and lets the Stripe Checkout redirect through
//  - report-only CSP carries a fresh nonce per response; the shell gets it stamped
//  - Permissions-Policy present; X-Powered-By gone
//  - cross-site browser writes are refused, everything else passes
//  - CSP reports are summarised without query strings

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const sec = require('../lib/security-headers');

let passed = 0;
let failed = 0;

async function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maal-sec-'));
  const shell = path.join(dir, 'index.html');
  fs.writeFileSync(shell, '<script>theme()</script><script type="module" crossorigin src="/assets/a.js"></script><noscript></noscript>');

  const app = express();
  sec.applySecurityHeaders(app);
  app.get('/page', (req, res) => res.send(res.locals.cspNonce));
  app.post('/write', express.urlencoded({ extended: false }), (req, res) => res.send('ok'));
  app.get('/shell', (req, res) => sec.sendShell(res, shell));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const warn = console.warn;
  const cases = [
    ['enforced CSP keeps the allowlist and allows the Stripe Checkout form redirect', async () => {
      const res = await fetch(base + '/page');
      const csp = res.headers.get('content-security-policy');
      assert.match(csp, /form-action 'self' https:\/\/checkout\.stripe\.com/);
      assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/cdn\.jsdelivr\.net https:\/\/js\.stripe\.com/);
      assert.match(csp, /frame-ancestors 'self'/);
      assert.match(csp, /object-src 'none'/);
    }],
    ['report-only CSP uses a fresh nonce that matches res.locals.cspNonce', async () => {
      const a = await fetch(base + '/page');
      const b = await fetch(base + '/page');
      const nonceA = await a.text();
      const ro = a.headers.get('content-security-policy-report-only');
      assert.ok(ro.includes(`'nonce-${nonceA}'`), ro);
      assert.match(ro, /'strict-dynamic'/);
      assert.match(ro, /report-uri \/csp-report/);
      assert.notStrictEqual(nonceA, await b.text());
      assert.match(a.headers.get('reporting-endpoints'), /csp-endpoint="\/csp-report"/);
    }],
    ['companion headers: Permissions-Policy, nosniff, HSTS, no X-Powered-By', async () => {
      const res = await fetch(base + '/page');
      assert.strictEqual(res.headers.get('permissions-policy'), sec.PERMISSIONS_POLICY);
      assert.match(sec.PERMISSIONS_POLICY, /microphone=\(self\)/); // Ask Maal voice input
      assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(res.headers.get('strict-transport-security'));
      assert.strictEqual(res.headers.get('x-powered-by'), null);
    }],
    ['the React shell gets the nonce on every <script> and is not cached stale', async () => {
      const res = await fetch(base + '/shell');
      const html = await res.text();
      const nonce = res.headers.get('content-security-policy-report-only').match(/'nonce-([^']+)'/)[1];
      assert.strictEqual(html.split(`<script nonce="${nonce}"`).length - 1, 2, html);
      assert.ok(html.includes('<noscript>'), 'only <script> tags are touched');
      assert.strictEqual(res.headers.get('cache-control'), 'no-cache');
      assert.match(res.headers.get('content-type'), /text\/html/);
    }],
    ['cross-site browser POST is refused', async () => {
      const res = await fetch(base + '/write', { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } });
      assert.strictEqual(res.status, 403);
    }],
    ['same-origin, same-site, user-initiated and header-less POSTs pass', async () => {
      for (const site of ['same-origin', 'same-site', 'none', null]) {
        const headers = site ? { 'Sec-Fetch-Site': site } : {};
        const res = await fetch(base + '/write', { method: 'POST', headers });
        assert.strictEqual(res.status, 200, `Sec-Fetch-Site=${site}`);
      }
    }],
    ['cross-site GET navigation still passes', async () => {
      const res = await fetch(base + '/page', { headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate' } });
      assert.strictEqual(res.status, 200);
    }],
    ['CSP report logs contain only directive and source classifications', async () => {
      const lines = [];
      console.warn = (m) => lines.push(m);
      const res = await fetch(base + '/csp-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/csp-report' },
        body: JSON.stringify({ 'csp-report': {
          'document-uri': 'https://www.hellomaal.com/login/someone%40example.com?mode=test',
          'effective-directive': 'script-src-elem',
          'blocked-uri': 'https://example.test/x.js?token=sample',
          'script-sample': 'private text',
        } }),
      });
      console.warn = warn;
      assert.strictEqual(res.status, 204);
      assert.strictEqual(lines.length, 1);
      assert.deepStrictEqual(lines, ['[csp-report] script-src-elem blocked=other']);
    }],
    ['Reporting API batches are summarised too', async () => {
      const items = sec.summariseReport([
        { type: 'csp-violation', body: { documentURL: 'https://x.test/a?b=1', effectiveDirective: 'script-src-elem', blockedURL: 'inline', sample: 'alert(1)' } },
        { type: 'deprecation', body: {} },
      ]);
      assert.deepStrictEqual(items, [{ directive: 'script-src-elem', blocked: 'inline' }]);
    }],
  ];

  for (const [name, fn] of cases) {
    try { await fn(); passed++; console.log(`  ok  ${name}`); }
    catch (e) { console.warn = warn; failed++; console.error(`  FAIL ${name}\n       ${e.message}`); }
  }
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\nsecurity-headers: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
