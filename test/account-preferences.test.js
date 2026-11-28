'use strict';
// HEL-42 — account "⋯" menu: Rename / Show in net worth.

const assert = require('node:assert/strict');
const test = require('node:test');
const pool = require('../db/pool');
const api = require('../routes/api');
const { validatePreferenceInput, isProviderReference, NAME_COLUMNS } = require('../lib/account-preferences');
const { setAccountPreference, reapplyAccountPreferences } = require('../db/account-preferences');

const handler = api.stack
  .find(({ route }) => route?.path === '/v1/account-preferences/:table/:id' && route.methods.patch)
  .route.stack[0].handle;

async function patch(body, { table = 'cash_accounts', id = '7', userId = 12 } = {}) {
  let status = 200;
  let data;
  await handler({ body, params: { table, id }, session: { userId } }, {
    status(code) { status = code; return this; },
    json(value) { data = value; },
  });
  return { status, data };
}

function fakeClient(rowsForUpdate) {
  const calls = [];
  return {
    calls,
    client: {
      async query(sql, values) {
        calls.push({ sql: String(sql), values });
        if (/^\s*UPDATE/.test(sql)) return { rows: rowsForUpdate };
        return { rows: [] };
      },
      release() {},
    },
  };
}

test('validation: tables, ids, names and booleans', () => {
  assert.equal(validatePreferenceInput('users', '1', { display_name: 'x' }).status, 404);
  assert.equal(validatePreferenceInput('cash_accounts', 'abc', { display_name: 'x' }).status, 404);
  assert.equal(validatePreferenceInput('cash_accounts', '1', {}).status, 400);
  assert.equal(validatePreferenceInput('cash_accounts', '1', { display_name: '   ' }).status, 400);
  assert.equal(validatePreferenceInput('cash_accounts', '1', { display_name: 'x'.repeat(61) }).status, 400);
  assert.equal(validatePreferenceInput('cash_accounts', '1', { display_name: 5 }).status, 400);
  assert.equal(validatePreferenceInput('cash_accounts', '1', { include_in_net_worth: 'no' }).status, 400);
  const ok = validatePreferenceInput('investments', '9', { display_name: '  Joint   savings ', include_in_net_worth: false });
  assert.deepEqual(ok, { ok: true, nameColumn: 'name', displayName: 'Joint savings', include: false });
  assert.equal(NAME_COLUMNS.cash_accounts, 'label');
});

test('provider references are recognised; manual ids are not', () => {
  assert.equal(isProviderReference('basiq:abc-123'), true);
  assert.equal(isProviderReference('lunchflow:XYZ_9'), true);
  assert.equal(isProviderReference('cash:12'), false);
  assert.equal(isProviderReference(null), false);
  assert.equal(isProviderReference('basiq:bad id'), false);
});

test('PATCH authenticates and validates before touching the database', async (t) => {
  const connect = t.mock.method(pool, 'connect', () => assert.fail('validation should run before SQL'));
  assert.equal((await patch({ display_name: 'A' }, { userId: null })).status, 401);
  assert.equal((await patch({ display_name: 'A' }, { table: 'transactions' })).status, 404);
  assert.equal((await patch({ display_name: 'A' }, { id: '1; DROP' })).status, 404);
  assert.equal((await patch({ user_id: 13 })).status, 400);
  assert.equal(connect.mock.callCount(), 0);
});

test('manual row: update is scoped to the caller and stores no provider preference', async (t) => {
  const { client, calls } = fakeClient([{ id: 7, label: 'Everyday', account_reference: null }]);
  t.mock.method(pool, 'connect', async () => client);
  const res = await patch({ display_name: 'Everyday' });
  assert.equal(res.status, 200);
  const update = calls.find((c) => /^\s*UPDATE/.test(c.sql));
  assert.match(update.sql, /WHERE id = \$1 AND user_id = \$2/);
  assert.deepEqual(update.values, ['7', 12, 'Everyday', null]);
  assert.ok(!calls.some((c) => /account_preferences/.test(c.sql)));
  assert.ok(calls.some((c) => c.sql === 'COMMIT'));
});

test('another user\'s row: 404 and nothing stored', async (t) => {
  const { client, calls } = fakeClient([]);
  t.mock.method(pool, 'connect', async () => client);
  assert.equal((await patch({ include_in_net_worth: false }, { userId: 99 })).status, 404);
  assert.ok(!calls.some((c) => /account_preferences/.test(c.sql)));
});

test('linked row: the choice is also kept by provider reference for the next refresh', async (t) => {
  const { client, calls } = fakeClient([{ id: 7, label: 'Bills', account_reference: 'basiq:acc-1' }]);
  t.mock.method(pool, 'connect', async () => client);
  const row = await setAccountPreference(12, 'cash_accounts', '7', { include: false });
  assert.equal(row.id, 7);
  const upsert = calls.find((c) => /INSERT INTO account_preferences/.test(c.sql));
  assert.deepEqual(upsert.values, [12, 'basiq:acc-1', null, false]);
  assert.match(upsert.sql, /ON CONFLICT \(user_id, account_key\)/);
});

test('refresh re-applies choices only to the caller\'s rows, across every provider mirror table', async () => {
  const { client, calls } = fakeClient([]);
  await reapplyAccountPreferences(client, 12);
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.match(call.sql, /account\.user_id = \$1/);
    assert.match(call.sql, /pref\.user_id = \$1/);
    assert.match(call.sql, /pref\.account_key = account\.account_reference/);
    assert.deepEqual(call.values, [12]);
  }
});
