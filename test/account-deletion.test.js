'use strict';
// test/account-deletion.test.js
// Deterministic tests for services/account-deletion.js — no DB, Stripe or
// bucket: every dependency is a recording fake.

const assert = require('assert');
const { deleteAccount } = require('../services/account-deletion');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.stack || e.message}`); failed++; }
}

const quietLog = { error() {}, log() {} };

function fakePool({ customerId = null, storageKeys = [], userExists = true, sessionRows = 2 } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (/^SELECT stripe_customer_id FROM users/.test(sql)) {
        return { rows: userExists ? [{ stripe_customer_id: customerId }] : [] };
      }
      if (/FROM vault_files/.test(sql)) return { rows: storageKeys.map((k) => ({ storage_key: k })) };
      if (/^DELETE FROM users/.test(sql)) return { rowCount: 1, rows: [] };
      if (/DELETE FROM session/.test(sql)) return { rowCount: sessionRows, rows: [] };
      throw new Error('unexpected SQL: ' + sql);
    },
  };
}

function fakeStripe(subs, { failOn } = {}) {
  const events = [];
  return {
    events,
    subscriptions: {
      async list(args) { events.push(['list', args.customer]); return { data: subs }; },
      async cancel(id) {
        if (failOn === id) throw new Error('stripe down');
        events.push(['cancel', id]);
        return { id, status: 'canceled' };
      },
    },
  };
}

function fakeStorage({ failKeys = [] } = {}) {
  const removed = [];
  return {
    removed,
    async deleteObject(key) {
      if (failKeys.includes(key)) throw new Error('bucket error');
      removed.push(key);
    },
  };
}

(async () => {
  console.log('\nAccount deletion (Settings → Delete account)');

  await test('every SQL statement is scoped to the user id (no IDOR)', async () => {
    const pool = fakePool({ storageKeys: ['vault/7/a.pdf'] });
    await deleteAccount(7, { pool, stripe: null, storage: fakeStorage(), log: quietLog });
    for (const c of pool.calls) {
      assert.ok(/\$1/.test(c.sql), `query must be parameterised: ${c.sql}`);
      assert.ok(c.params[0] === 7 || c.params[0] === '7', `query must bind the user id: ${c.sql}`);
    }
  });

  await test('cancels active subscriptions BEFORE deleting the user', async () => {
    const order = [];
    const pool = fakePool({ customerId: 'cus_123' });
    const origQuery = pool.query.bind(pool);
    pool.query = async (sql, params) => { if (/^DELETE FROM users/.test(sql)) order.push('delete-user'); return origQuery(sql, params); };
    const stripe = fakeStripe([
      { id: 'sub_active', status: 'active' },
      { id: 'sub_trial', status: 'trialing' },
      { id: 'sub_old', status: 'canceled' },
    ]);
    const origCancel = stripe.subscriptions.cancel;
    stripe.subscriptions.cancel = async (id) => { order.push('cancel:' + id); return origCancel(id); };
    const r = await deleteAccount(7, { pool, stripe, storage: null, log: quietLog });
    assert.deepStrictEqual(order, ['cancel:sub_active', 'cancel:sub_trial', 'delete-user']);
    assert.strictEqual(r.subscriptionsCancelled, 2);
    assert.strictEqual(r.deleted, true);
  });

  await test('a Stripe failure aborts the deletion — nothing is deleted', async () => {
    const pool = fakePool({ customerId: 'cus_123' });
    const stripe = fakeStripe([{ id: 'sub_active', status: 'active' }], { failOn: 'sub_active' });
    await assert.rejects(
      () => deleteAccount(7, { pool, stripe, storage: null, log: quietLog }),
      (e) => e.code === 'billing_cancel_failed'
    );
    assert.ok(!pool.calls.some((c) => /^DELETE/.test(c.sql)), 'no DELETE may run after a billing failure');
  });

  await test('no Stripe customer (or no Stripe configured) still deletes', async () => {
    const pool = fakePool({ customerId: null });
    const stripe = fakeStripe([]);
    const r = await deleteAccount(7, { pool, stripe, storage: null, log: quietLog });
    assert.strictEqual(r.deleted, true);
    assert.deepStrictEqual(stripe.events, [], 'Stripe is not called without a customer id');
    const r2 = await deleteAccount(7, { pool: fakePool({ customerId: 'cus_9' }), stripe: null, storage: null, log: quietLog });
    assert.strictEqual(r2.deleted, true);
  });

  await test('purges other devices’ sessions for this user only', async () => {
    const pool = fakePool({ sessionRows: 3 });
    const r = await deleteAccount(42, { pool, stripe: null, storage: null, log: quietLog });
    const purge = pool.calls.find((c) => /DELETE FROM session/.test(c.sql));
    assert.ok(purge, 'session purge must run');
    assert.ok(/sess->>'userId' = \$1/.test(purge.sql));
    assert.deepStrictEqual(purge.params, ['42']);
    assert.strictEqual(r.sessionsPurged, 3);
  });

  await test('removes Vault files from object storage after the cascade (best effort)', async () => {
    const order = [];
    const pool = fakePool({ storageKeys: ['vault/7/a.pdf', 'vault/7/b.pdf', 'vault/7/c.pdf'] });
    const origQuery = pool.query.bind(pool);
    pool.query = async (sql, params) => { if (/^DELETE FROM users/.test(sql)) order.push('delete-user'); return origQuery(sql, params); };
    const storage = fakeStorage({ failKeys: ['vault/7/b.pdf'] });
    const origDel = storage.deleteObject;
    storage.deleteObject = async (k) => { order.push('blob'); return origDel(k); };
    const r = await deleteAccount(7, { pool, stripe: null, storage, log: quietLog });
    assert.strictEqual(order[0], 'delete-user', 'blobs are removed only after the user row is gone');
    assert.deepStrictEqual(storage.removed, ['vault/7/a.pdf', 'vault/7/c.pdf']);
    assert.strictEqual(r.filesRemoved, 2);
    assert.strictEqual(r.filesFailed, 1);
    assert.strictEqual(r.deleted, true, 'a bucket error never un-deletes the account');
  });

  await test('unknown user → not_found, nothing deleted', async () => {
    const pool = fakePool({ userExists: false });
    const r = await deleteAccount(7, { pool, stripe: null, storage: null, log: quietLog });
    assert.deepStrictEqual(r, { deleted: false, reason: 'not_found' });
    assert.ok(!pool.calls.some((c) => /^DELETE/.test(c.sql)));
  });

  await test('rejects a non-numeric user id', async () => {
    await assert.rejects(() => deleteAccount('abc', { pool: fakePool(), stripe: null, storage: null, log: quietLog }), /Invalid user id/);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
