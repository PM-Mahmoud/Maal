'use strict';
// Deterministic tests for advisor chat management (favourite / rename / delete):
//  1. lib/advisor-threads.js pure validation
//  2. db/advisor.js thread queries — every statement is user-scoped (IDOR guard)
//  3. routes/advisor-threads.js — auth, validation, 404-on-foreign-thread
// No database or network: the pg pool is a recording stub and the router is
// exercised over a loopback HTTP server with an injected fake db.

const assert = require('assert');
const http = require('http');
const express = require('express');

let passed = 0;
let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

// ─── 1. Pure helpers ─────────────────────────────────────────────────────────
const t = require('../lib/advisor-threads');

test('sanitizeTitle trims, collapses whitespace, strips control chars, caps length', () => {
  assert.strictEqual(t.sanitizeTitle('  Road   to\twealth \n'), 'Road to wealth');
  assert.strictEqual(t.sanitizeTitle('a\u0000b'), 'a b');
  assert.strictEqual(t.sanitizeTitle('   '), null);
  assert.strictEqual(t.sanitizeTitle(42), null);
  assert.strictEqual(t.sanitizeTitle('x'.repeat(200)).length, t.TITLE_MAX);
});

test('deriveTitle uses the first line and cuts long questions on a word boundary', () => {
  assert.strictEqual(t.deriveTitle('Salary sacrifice into super?\nmore detail'), 'Salary sacrifice into super?');
  const long = 'Should I put extra money into my offset account or make extra repayments on my home loan this year';
  const d = t.deriveTitle(long);
  assert.ok(d.endsWith('…'), d);
  assert.ok(d.length <= 61, d);
  assert.ok(!/\s…$/.test(d));
  assert.strictEqual(t.deriveTitle(''), t.DEFAULT_TITLE);
});

test('parseThreadId accepts positive integer ids only', () => {
  assert.strictEqual(t.parseThreadId('42'), '42');
  assert.strictEqual(t.parseThreadId(7), '7');
  for (const bad of ['0', '-1', '1.5', 'abc', '1;DROP TABLE', '', null, undefined, '9'.repeat(19), crypto.randomUUID()]) {
    assert.strictEqual(t.parseThreadId(bad), null, String(bad));
  }
});

test('parseFavourite is strict', () => {
  assert.strictEqual(t.parseFavourite(true), true);
  assert.strictEqual(t.parseFavourite('false'), false);
  assert.strictEqual(t.parseFavourite('yes'), null);
  assert.strictEqual(t.parseFavourite(undefined), null);
});

test('sanitizeMeta keeps only widgets/followUps/citations, bounded', () => {
  const meta = t.sanitizeMeta({
    widgets: [{ type: 'donut', source: 'networth_composition', title: 'Net worth', data: {} }, { nope: 1 }],
    followUps: ['How does the first home super saver scheme work?', '', 3],
    citations: [{ label: 'Your goals' }, { href: 'x' }],
    evil: '<script>',
  });
  assert.deepStrictEqual(Object.keys(meta).sort(), ['citations', 'followUps', 'widgets']);
  assert.strictEqual(meta.widgets.length, 1);
  assert.deepStrictEqual(meta.followUps, ['How does the first home super saver scheme work?']);
  assert.deepStrictEqual(meta.citations, [{ label: 'Your goals' }]);
  assert.strictEqual(t.sanitizeMeta({}), null);
  assert.strictEqual(t.sanitizeMeta([1]), null);
  // Oversized widgets are dropped rather than rejecting the turn.
  const big = t.sanitizeMeta({ widgets: [{ type: 'table', source: 's', data: { rows: 'x'.repeat(40000) } }], followUps: ['ok'] });
  assert.deepStrictEqual(big, { followUps: ['ok'] });
});

test('validateMessages enforces roles, content and batch size; meta only on assistant', () => {
  assert.ok(t.validateMessages([]).error);
  assert.ok(t.validateMessages([{ role: 'system', content: 'x' }]).error);
  assert.ok(t.validateMessages([{ role: 'user', content: '  ' }]).error);
  assert.ok(t.validateMessages([1, 2, 3].map(() => ({ role: 'user', content: 'x' }))).error);
  const ok = t.validateMessages([
    { role: 'user', content: 'Hi', meta: { followUps: ['x'] } },
    { role: 'assistant', content: 'Hello', meta: { followUps: ['Tell me about HECS'] } },
  ]);
  assert.strictEqual(ok.messages[0].meta, null);
  assert.deepStrictEqual(ok.messages[1].meta, { followUps: ['Tell me about HECS'] });
});

test('toThread shapes ids as strings and defaults the title', () => {
  assert.deepStrictEqual(
    t.toThread({ id: 5, title: null, is_favourite: null, created_at: 'c', updated_at: 'u' }),
    { id: '5', title: t.DEFAULT_TITLE, is_favourite: false, created_at: 'c', updated_at: 'u' },
  );
});

// ─── 2. db/advisor.js — user-scoped SQL ──────────────────────────────────────
const calls = [];
let nextResults = [];
global.__maalPool = {
  query: async (sql, params) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    return nextResults.length ? nextResults.shift() : { rows: [], rowCount: 0 };
  },
};
const db = require('../db/advisor');

function lastCall() { return calls[calls.length - 1]; }
function assertScoped(call, userIdx) {
  assert.ok(/user_id = \$\d/.test(call.sql), `missing user_id filter: ${call.sql}`);
  const n = Number(call.sql.match(/user_id = \$(\d)/)[1]);
  assert.strictEqual(call.params[n - 1], userIdx, 'user_id param mismatch');
}

test('listThreads filters by user and orders favourites first', async () => {
  await db.listThreads(9);
  const c = lastCall();
  assertScoped(c, 9);
  assert.ok(/ORDER BY is_favourite DESC/.test(c.sql));
});

test('rename / favourite / delete all filter by id AND user_id', async () => {
  await db.renameThread('3', 9, 'Road to wealth');
  assertScoped(lastCall(), 9);
  assert.ok(/WHERE id = \$1 AND user_id = \$2/.test(lastCall().sql));
  await db.setFavourite('3', 9, true);
  assertScoped(lastCall(), 9);
  assert.strictEqual(lastCall().params[2], true);
  nextResults = [{ rows: [], rowCount: 0 }];
  assert.strictEqual(await db.deleteThread('3', 9), false);
  assertScoped(lastCall(), 9);
  nextResults = [{ rows: [], rowCount: 1 }];
  assert.strictEqual(await db.deleteThread('3', 9), true);
});

test('getThreadMessages returns null (no message query) for a foreign thread', async () => {
  calls.length = 0;
  nextResults = [{ rows: [] }];
  assert.strictEqual(await db.getThreadMessages('3', 9), null);
  assert.strictEqual(calls.length, 1);
  assertScoped(calls[0], 9);
});

test('getThreadMessages scopes the message query to the user too', async () => {
  calls.length = 0;
  nextResults = [{ rows: [{ id: 3, title: 'x' }] }, { rows: [{ id: 1, role: 'user', content: 'hi', meta: null }] }];
  const r = await db.getThreadMessages('3', 9);
  assert.strictEqual(r.messages.length, 1);
  assertScoped(calls[1], 9);
});

test('appendThreadMessages writes nothing when the thread is not the user\'s', async () => {
  calls.length = 0;
  nextResults = [{ rows: [] }];
  const r = await db.appendThreadMessages('3', 9, [{ role: 'user', content: 'hi', meta: null }]);
  assert.strictEqual(r, null);
  assert.strictEqual(calls.length, 1);
  assert.ok(!/INSERT/.test(calls[0].sql));
  assertScoped(calls[0], 9);
});

test('appendThreadMessages inserts each message guarded by an ownership EXISTS', async () => {
  calls.length = 0;
  nextResults = [{ rows: [{ id: 3, title: 'Salary sacrifice' }] }];
  await db.appendThreadMessages('3', 9, [
    { role: 'user', content: 'hi', meta: null },
    { role: 'assistant', content: 'hello', meta: { followUps: ['x'] } },
  ], { autoTitle: 'hi', defaultTitle: 'New chat' });
  assert.strictEqual(calls.length, 3);
  for (const c of calls.slice(1)) {
    assert.ok(/WHERE EXISTS \(SELECT 1 FROM advisor_sessions WHERE id = \$1 AND user_id = \$5\)/.test(c.sql), c.sql);
    assert.strictEqual(c.params[4], 9);
  }
  assert.strictEqual(calls[2].params[3], JSON.stringify({ followUps: ['x'] }));
  // Auto-title never overwrites a user-chosen title.
  assert.ok(/title IS NULL OR title = '' OR title = \$4/.test(calls[0].sql));
});

// ─── 3. Router ───────────────────────────────────────────────────────────────
const { createAdvisorThreadsRouter } = require('../routes/advisor-threads');

// Fake db: user 1 owns thread 10, user 2 owns thread 20.
function makeFakeDb() {
  const threads = new Map([
    ['10', { id: 10, user_id: 1, title: 'New chat', is_favourite: false, created_at: 'c', updated_at: 'u', messages: [] }],
    ['20', { id: 20, user_id: 2, title: 'Gold', is_favourite: false, created_at: 'c', updated_at: 'u', messages: [] }],
  ]);
  let seq = 30;
  const own = (id, uid) => { const r = threads.get(String(id)); return r && r.user_id === uid ? r : null; };
  return {
    threads,
    listThreads: async (uid) => [...threads.values()].filter((r) => r.user_id === uid),
    createThread: async (uid, title) => { const r = { id: seq++, user_id: uid, title, is_favourite: false, messages: [] }; threads.set(String(r.id), r); return r; },
    getThreadMessages: async (id, uid) => { const r = own(id, uid); return r ? { thread: r, messages: r.messages } : null; },
    renameThread: async (id, uid, title) => { const r = own(id, uid); if (r) r.title = title; return r; },
    setFavourite: async (id, uid, f) => { const r = own(id, uid); if (r) r.is_favourite = f; return r; },
    deleteThread: async (id, uid) => { const r = own(id, uid); if (r) threads.delete(String(id)); return !!r; },
    appendThreadMessages: async (id, uid, msgs, { autoTitle, defaultTitle } = {}) => {
      const r = own(id, uid); if (!r) return null;
      msgs.forEach((m, i) => r.messages.push({ id: r.messages.length + i + 1, ...m }));
      if (autoTitle && r.title === defaultTitle) r.title = autoTitle;
      return r;
    },
  };
}

async function withServer(fakeDb, fn) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { const u = req.headers['x-user']; req.session = u ? { userId: Number(u) } : {}; next(); });
  app.use('/api', createAdvisorThreadsRouter({ db: fakeDb }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/advisor/threads`;
  const call = async (method, path, { user, body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(user ? { 'x-user': String(user) } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  try { await fn(call); } finally { server.close(); }
}

test('router: unauthenticated requests get 401', async () => {
  await withServer(makeFakeDb(), async (call) => {
    assert.strictEqual((await call('GET', '')).status, 401);
    assert.strictEqual((await call('DELETE', '/10')).status, 401);
  });
});

test('router: list returns only the caller\'s chats', async () => {
  await withServer(makeFakeDb(), async (call) => {
    const r = await call('GET', '', { user: 1 });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.json.threads.map((x) => x.id), ['10']);
  });
});

test('router: rename, favourite and delete of another user\'s chat are 404 and change nothing', async () => {
  const fake = makeFakeDb();
  await withServer(fake, async (call) => {
    assert.strictEqual((await call('PATCH', '/20', { user: 1, body: { title: 'Hijack' } })).status, 404);
    assert.strictEqual((await call('PATCH', '/20', { user: 1, body: { is_favourite: true } })).status, 404);
    assert.strictEqual((await call('DELETE', '/20', { user: 1 })).status, 404);
    assert.strictEqual((await call('GET', '/20', { user: 1 })).status, 404);
    assert.strictEqual((await call('POST', '/20/messages', { user: 1, body: { messages: [{ role: 'user', content: 'x' }] } })).status, 404);
    const victim = fake.threads.get('20');
    assert.strictEqual(victim.title, 'Gold');
    assert.strictEqual(victim.is_favourite, false);
    assert.strictEqual(victim.messages.length, 0);
  });
});

test('router: rename validates and persists; favourite toggles', async () => {
  const fake = makeFakeDb();
  await withServer(fake, async (call) => {
    assert.strictEqual((await call('PATCH', '/10', { user: 1, body: { title: '   ' } })).status, 400);
    assert.strictEqual((await call('PATCH', '/10', { user: 1, body: {} })).status, 400);
    assert.strictEqual((await call('PATCH', '/10', { user: 1, body: { is_favourite: 'maybe' } })).status, 400);
    const r = await call('PATCH', '/10', { user: 1, body: { title: '  Road to wealth ' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.thread.title, 'Road to wealth');
    const f = await call('PATCH', '/10', { user: 1, body: { is_favourite: true } });
    assert.strictEqual(f.json.thread.is_favourite, true);
  });
});

test('router: malformed ids are 404, never reach the db', async () => {
  const fake = makeFakeDb();
  let touched = false;
  fake.deleteThread = async () => { touched = true; return true; };
  await withServer(fake, async (call) => {
    assert.strictEqual((await call('DELETE', '/abc', { user: 1 })).status, 404);
    assert.strictEqual((await call('DELETE', '/1%3BDROP', { user: 1 })).status, 404);
    assert.strictEqual(touched, false);
  });
});

test('router: create, append a turn (auto-titles), open with rich parts, delete', async () => {
  const fake = makeFakeDb();
  await withServer(fake, async (call) => {
    const c = await call('POST', '', { user: 1, body: {} });
    assert.strictEqual(c.status, 201);
    const id = c.json.thread.id;
    assert.strictEqual(c.json.thread.title, t.DEFAULT_TITLE);
    const a = await call('POST', `/${id}/messages`, { user: 1, body: { messages: [
      { role: 'user', content: 'How does salary sacrifice into super work?' },
      { role: 'assistant', content: 'Here is how…', meta: { followUps: ['What is the concessional cap?'] } },
    ] } });
    assert.strictEqual(a.status, 201);
    assert.strictEqual(a.json.thread.title, 'How does salary sacrifice into super work?');
    const g = await call('GET', `/${id}`, { user: 1 });
    assert.strictEqual(g.json.messages.length, 2);
    assert.deepStrictEqual(g.json.messages[1].followUps, ['What is the concessional cap?']);
    assert.strictEqual((await call('DELETE', `/${id}`, { user: 1 })).status, 200);
    assert.strictEqual((await call('GET', `/${id}`, { user: 1 })).status, 404);
  });
});

test('router: import creates chats for the session user only', async () => {
  const fake = makeFakeDb();
  await withServer(fake, async (call) => {
    const r = await call('POST', '/import', { user: 2, body: { threads: [
      { title: 'Offset vs extra repayments', messages: [{ role: 'user', content: 'Offset or extra repayments?' }, { role: 'assistant', content: 'Let us compare…' }] },
      { title: 'Empty', messages: [] },
    ] } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.imported.length, 1);
    const created = fake.threads.get(r.json.imported[0].id);
    assert.strictEqual(created.user_id, 2);
    assert.strictEqual(created.messages.length, 2);
  });
});

(async () => {
  console.log('\nadvisor threads (favourite / rename / delete)');
  for (const { name, fn } of queue) {
    try { await fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.stack || e.message}`); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
