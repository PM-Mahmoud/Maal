'use strict';
// Deterministic tests for lib/static-assets.js (the static mounts server.js uses).
// A temp public/ folder mirrors the real layout; a catch-all stands in for the
// SPA handler. No database or network beyond a loopback server.
//  - /app/assets (a SPA route that is also a folder) must reach the SPA, not 301
//  - real files under public/ and /assets/* still serve 200

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const { mountStatic } = require('../lib/static-assets');

let passed = 0;
let failed = 0;

function makePublic() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maal-static-'));
  fs.mkdirSync(path.join(dir, 'app', 'assets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'css'));
  fs.writeFileSync(path.join(dir, 'app', 'index.html'), '<div id="root"></div>');
  fs.writeFileSync(path.join(dir, 'app', 'assets', 'app-abc.js'), 'console.log(1)');
  fs.writeFileSync(path.join(dir, 'css', 'theme.css'), 'body{}');
  fs.writeFileSync(path.join(dir, 'favicon.png'), 'png');
  return dir;
}

async function run() {
  const dir = makePublic();
  const app = express();
  mountStatic(app, dir);
  app.use('*', (req, res) => res.status(200).send('SPA:' + req.originalUrl));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (p) => {
    const res = await fetch(base + p, { redirect: 'manual' });
    return { status: res.status, body: await res.text(), location: res.headers.get('location') };
  };

  const cases = [
    ['/app/assets reaches the SPA (no 301 to a trailing slash)', async () => {
      const r = await get('/app/assets');
      assert.strictEqual(r.status, 200, `got ${r.status} location=${r.location}`);
      assert.strictEqual(r.body, 'SPA:/app/assets');
    }],
    ['/app/assets/ (trailing slash) reaches the SPA', async () => {
      const r = await get('/app/assets/');
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body, 'SPA:/app/assets/');
    }],
    ['/app and /css folders fall through instead of redirecting', async () => {
      assert.strictEqual((await get('/app')).body, 'SPA:/app');
      assert.strictEqual((await get('/css')).body, 'SPA:/css');
    }],
    ['bundle chunk served from /assets/*', async () => {
      const r = await get('/assets/app-abc.js');
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body, 'console.log(1)');
    }],
    ['other static files still serve', async () => {
      assert.strictEqual((await get('/css/theme.css')).body, 'body{}');
      assert.strictEqual((await get('/favicon.png')).body, 'png');
      assert.strictEqual((await get('/app/assets/app-abc.js')).body, 'console.log(1)');
    }],
  ];

  for (const [name, fn] of cases) {
    try { await fn(); passed++; console.log(`  ok  ${name}`); }
    catch (e) { failed++; console.error(`  FAIL ${name}\n       ${e.message}`); }
  }
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\nstatic-routing: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
