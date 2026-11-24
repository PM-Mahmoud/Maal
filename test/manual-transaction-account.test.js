'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const pool = require('../db/pool');
const quality = require('../services/data-quality');
const api = require('../routes/api');

const handler = api.stack.find(({ route }) => route?.path === '/v1/transactions' && route.methods.post).route.stack[0].handle;
const transaction = { description: 'Pet food', amount: -42, occurred_on: '2026-10-15' };

async function post(body, userId = 91) {
  let status = 200;
  let data;
  await handler({ body, session: { userId } }, {
    status(code) { status = code; return this; },
    json(value) { data = value; },
  });
  return { status, data };
}

function transactionPool(t, { ownsAccount = true } = {}) {
  const queries = [];
  const qualityCheck = t.mock.method(quality, 'runDataQualityChecks', async () => {});
  let released = false;
  const connect = t.mock.method(pool, 'connect', async () => ({
    async query(sql, params) {
      queries.push({ sql, params });
      if (/INSERT INTO transactions/.test(sql)) return { rows: [{ id: '84' }] };
      if (/INSERT INTO transaction_manual_accounts/.test(sql)) {
        assert.match(sql, /ca\.id = \$3 AND ca\.user_id = \$1/);
        assert.match(sql, /WHERE t\.id = \$2 AND t\.user_id = \$1/);
        assert.deepEqual(params, [91, '84', '73']);
        return { rowCount: ownsAccount ? 1 : 0 };
      }
      return { rows: [] };
    },
    release() { released = true; },
  }));
  return { connect, queries, qualityCheck, released: () => released };
}

test('POST validates account ID before starting a transaction', async (t) => {
  const db = transactionPool(t);
  for (const cash_account_id of [['73'], 'free text', 0, -42, 4.2, true, '', '9999999999999999999']) {
    assert.equal((await post({ ...transaction, cash_account_id })).status, 400);
  }
  assert.equal(db.connect.mock.callCount(), 0);
});

test('POST links an owned cash account atomically without creating provider observations', async (t) => {
  const db = transactionPool(t);
  assert.deepEqual(await post({ data: { ...transaction, cash_account_id: '73' } }), { status: 200, data: { id: '84' } });
  assert.equal(db.queries[0].sql, 'BEGIN');
  assert.match(db.queries[1].sql, /INSERT INTO transactions/);
  assert.match(db.queries[2].sql, /INSERT INTO transaction_manual_accounts/);
  assert.match(db.queries[3].sql, /INSERT INTO raw_financial_records/);
  assert.equal(db.queries[4].sql, 'COMMIT');
  assert.equal(db.queries.some(({ sql }) => sql.includes('transaction_provider_details')), false);
  assert.equal(db.qualityCheck.mock.callCount(), 1);
  assert.equal(db.released(), true);
});

test('POST rolls back the new transaction when the cash account belongs to someone else or is missing', async (t) => {
  const db = transactionPool(t, { ownsAccount: false });
  assert.deepEqual(await post({ ...transaction, cash_account_id: 73 }), {
    status: 404,
    data: { error: 'Cash account not found.' },
  });
  assert.equal(db.queries.length, 4);
  assert.equal(db.queries.at(-1).sql, 'ROLLBACK');
  assert.equal(db.qualityCheck.mock.callCount(), 0);
  assert.equal(db.released(), true);
});

test('POST without an account keeps manual entry and CSV imports unlinked', async (t) => {
  const db = transactionPool(t);
  assert.equal((await post({ data: transaction })).status, 200);
  assert.equal((await post({ ...transaction, cash_account_id: null })).status, 200);
  assert.equal(db.queries.some(({ sql }) => sql.includes('transaction_manual_accounts')), false);
  assert.equal(db.queries.filter(({ sql }) => sql === 'COMMIT').length, 2);
});
