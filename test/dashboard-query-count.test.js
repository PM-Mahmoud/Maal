'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const pool = require('../db/pool');
const assets = require('../db/assets');
const { beginRequest, instrumentClient } = require('../db/query-metrics');

test('batched asset totals and exclusions match the previous seven owner-scoped reads', async (t) => {
  const rows = [
    { key: 'cashAccounts', accounts: [{ balance: '22.10' }, { balance: '200', include_in_net_worth: false }] },
    { key: 'investments', accounts: [{ value: '200' }] },
    { key: 'properties', accounts: [{ value: '200000', mortgage_balance: '90000' }] },
    { key: 'debts', accounts: [{ balance: '800' }] },
    { key: 'superAccounts', accounts: [{ balance: '500' }] },
    { key: 'incomes', accounts: [{ annual_amount: '96000' }] },
    { key: 'otherAssets', accounts: [] },
  ];
  const tables = ['cash_accounts', 'investments', 'properties', 'debts', 'super_accounts', 'incomes', 'other_assets'];
  const query = t.mock.method(pool, 'query', async (sql, args) => {
    assert.deepEqual(args, [42]);
    if (sql.includes('UNION ALL')) {
      assert.equal(sql.match(/t\.user_id = \$1/g).length, tables.length);
      return { rows };
    }
    const i = tables.indexOf(sql.match(/FROM (\w+) WHERE user_id = \$1/)[1]);
    assert.ok(i >= 0);
    return { rows: rows[i].accounts };
  });
  const oldReads = ['listCashAccounts', 'listInvestments', 'listProperties', 'listDebts', 'listSuperAccounts', 'listIncomes', 'listOtherAssets'];
  const oldRows = await Promise.all(oldReads.map((read) => assets[read](42)));
  const expected = assets.summarizeAssets(Object.fromEntries(rows.map(({ key }, i) => [key, oldRows[i]])));
  assert.equal(query.mock.callCount(), 7);
  assert.deepEqual(await assets.getLegacyAssetSummary(42), expected);
  assert.equal(query.mock.callCount(), 8);
});

test('recurring manual query overlaps transaction loading and preserves the merge', async (t) => {
  const transactions = require('../db/transactions');
  const recurringDb = require('../db/recurring-items');
  const transactionDetail = require('../db/transaction-detail');
  const { mergeRecurring } = await import('../shared/recurring.mjs');
  const manualRows = [{
    id: '1', name: 'Fixture bill', kind: 'expense', status: 'active', amount: '9',
    frequency: 'monthly', next_date: '2026-12-05',
  }];
  let started = false;
  t.mock.method(recurringDb, 'listRecurringItems', async (id) => {
    assert.equal(id, 42);
    started = true;
    return manualRows;
  });
  t.mock.method(transactions, 'getTransactionsWithCategory', async (id, limit) => {
    assert.equal(id, 42);
    assert.equal(limit, 2000);
    assert.equal(started, true);
    return [{ id: 'fixture' }];
  });
  t.mock.method(transactionDetail, 'getEffectivePayments', async (id, rows) => {
    assert.equal(id, 42);
    assert.deepEqual(rows, [{ id: 'fixture' }]);
    return [];
  });
  const handler = require('../routes/api').stack.find((layer) => layer.route?.path === '/v1/transactions/recurring').route.stack[0].handle;
  await handler({ session: { userId: 42 } }, {
    json(body) { assert.deepEqual(body, { recurring: mergeRecurring([], manualRows) }); },
    status(code) { assert.fail(`unexpected status ${code}`); },
  });
});

test('query metrics track the request count and overlap without SQL, values, or URLs', async (t) => {
  const log = t.mock.method(console, 'info', () => {});
  class Client {
    async query(sql, params) { return { sql, params }; }
  }
  const client = new (instrumentClient(Client))();
  const response = new EventEmitter();
  await beginRequest({ method: 'GET', route: { path: '/fixture/:id' }, url: '/fixture/123' }, response, async () => {
    await Promise.all([client.query('SELECT one', ['private value']), client.query('SELECT two')]);
    await client.query('SELECT three');
    response.emit('finish');
  });
  const [[event, body]] = log.mock.calls.map((call) => call.arguments);
  const metrics = JSON.parse(body);
  assert.equal(event, '[db-metrics]');
  assert.equal(metrics.count, 3);
  assert.equal(metrics.peakInFlight, 2);
  assert.equal(metrics.route, '/fixture/:id');
  assert.ok(metrics.queryMs >= 0 && metrics.requestMs >= 0);
  assert.doesNotMatch(body, /SELECT|private value|123/);
});
