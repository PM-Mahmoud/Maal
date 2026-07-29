const assert = require('assert');
const { payloadHash, checkTransactions, checkAccounts } = require('../lib/data-quality');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('✓', name);
}

test('payload hash is deterministic across object key order', () => {
  assert.equal(payloadHash({ b: 2, a: { d: 4, c: 3 } }), payloadHash({ a: { c: 3, d: 4 }, b: 2 }));
  assert.notEqual(payloadHash({ amount: 1 }), payloadHash({ amount: 2 }));
  assert.equal(payloadHash(undefined), payloadHash(null));
});

test('transaction checks identify invalid amounts, dates and provider duplicates', () => {
  const findings = checkTransactions([
    { id: 1, basiq_id: 'same', amount: 'not-money', post_date: null },
    { id: 2, basiq_id: 'same', amount: 25, post_date: '2026-08-01' },
  ], { now: '2026-07-30T00:00:00Z' });
  assert.deepStrictEqual(findings.map((item) => item.check_code).sort(), [
    'transaction.duplicate_external_id',
    'transaction.future_date',
    'transaction.invalid_amount',
    'transaction.invalid_date',
  ]);
});

test('account checks identify stale and duplicate connected accounts', () => {
  const findings = checkAccounts([
    { id: 1, source: 'connected', account_reference: 'abc', balance: 10, updated_at: '2026-07-01' },
    { id: 2, source: 'connected', account_reference: 'abc', balance: 20, updated_at: '2026-07-29' },
  ], { now: '2026-07-30T00:00:00Z', staleAfterDays: 7 });
  assert.deepStrictEqual(findings.map((item) => item.check_code).sort(), [
    'account.duplicate_reference',
    'account.stale',
  ]);
});

test('manual accounts do not require source freshness', () => {
  assert.deepStrictEqual(checkAccounts([
    { id: 1, source: 'manual', balance: '100.25' },
  ], { now: '2026-07-30T00:00:00Z' }), []);
});

test('blank and null financial values are invalid, not silently treated as zero', () => {
  const transactionCodes = checkTransactions([
    { id: 1, amount: '', post_date: '2026-07-01' },
    { id: 2, amount: null, post_date: '2026-07-01' },
  ]).map((item) => item.check_code);
  assert.deepStrictEqual(transactionCodes, ['transaction.invalid_amount', 'transaction.invalid_amount']);
  assert.equal(checkAccounts([{ id: 3, balance: '  ' }])[0].check_code, 'account.invalid_balance');
});

test('production Basiq accounts receive connected-account freshness checks', () => {
  const findings = checkAccounts([
    { id: 1, source: 'basiq', balance: 10, updated_at: null },
  ], { now: '2026-07-30T00:00:00Z' });
  assert.equal(findings[0].check_code, 'account.missing_freshness');
});

test('impossible posting dates are rejected instead of normalised by JavaScript', () => {
  const findings = checkTransactions([
    { id: 1, amount: 10, post_date: '2026-02-30' },
  ], { now: '2026-07-30T00:00:00Z' });
  assert.equal(findings[0].check_code, 'transaction.invalid_date');
});

test('migration declares immutable evidence and user-scoped calculation lineage', () => {
  const sql = require('../migrations/1753900000000_financial_integrity').up.toString();
  assert.match(sql, /raw_financial_records_immutable/);
  assert.match(sql, /FOREIGN KEY \(raw_record_id, user_id\)/);
  assert.match(sql, /REFERENCES raw_financial_records\(id, user_id\)/);
});

console.log(`\n${passed} data-quality tests passed`);
