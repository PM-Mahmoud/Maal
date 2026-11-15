'use strict';
// Deterministic tests for the redesigned "Create rule" flow: multi-condition
// matching (merchant / type / amount / categories / date), rule-input
// validation, and preview == apply parity. All pure — no DB, no network.

const assert = require('assert');
const {
  matchRule, computeAssignments, normaliseRuleInput,
  withEffectiveCategory, selectRuleMatches, previewRuleMatches,
} = require('../services/transaction-rules');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.error('  ✗ ' + name); console.error('    ' + e.message); failed++; }
}

// A small AU ledger. Signed amounts: negative = money out.
const ROWS = [
  { id: 1, description: 'WOOLWORTHS 1234 SYDNEY', amount: '-100.00', post_date: '2026-03-02' },
  { id: 2, description: 'COLES 0456 PARRAMATTA', amount: '-100.01', post_date: '2026-03-04' },
  { id: 3, description: 'OPAL TRANSPORT', amount: '-4.80', post_date: '2026-02-12' },
  { id: 4, description: 'MYKI TOP UP', amount: '-50.00', post_date: '2026-01-21' },
  { id: 5, description: 'SALARY ACME PTY LTD', amount: '4200.00', post_date: '2026-03-01' },
  { id: 6, description: 'JB HI-FI BONDI', amount: '-1299.00', post_date: '2026-02-28', category_group: 'Shopping', category: 'Electronics', category_source: 'manual' },
  { id: 7, description: 'BUNNINGS ALEXANDRIA', amount: '-250.00', post_date: '2026-03-10', category_group: 'Housing', category: 'Home maintenance', category_source: 'rule' },
  { id: 8, description: 'MYSTERY MERCHANT', amount: '-100', post_date: null },
];

console.log('\nmatchRule — conditions');

test('a rule with no conditions never matches', () => {
  assert.ok(!matchRule({}, ROWS[0]));
  assert.ok(!matchRule({ match_text: '   ', conditions: {} }, ROWS[0]));
});

test('amount equal to compares |amount| in whole cents', () => {
  const rule = { conditions: { amount: { op: 'eq', value: 100 } } };
  assert.ok(matchRule(rule, ROWS[0]), '-100.00 equals $100');
  assert.ok(!matchRule(rule, ROWS[1]), '-100.01 is not $100');
  assert.ok(matchRule(rule, ROWS[7]), 'string "-100" equals $100');
  assert.ok(matchRule({ conditions: { amount: { op: 'eq', value: 0.3 } } }, { amount: 0.1 + 0.2 }), 'no float drift');
});

test('amount greater than / less than are strict', () => {
  const gt = { conditions: { amount: { op: 'gt', value: 100 } } };
  assert.ok(!matchRule(gt, ROWS[0]), '$100.00 is not greater than $100');
  assert.ok(matchRule(gt, ROWS[1]), '$100.01 is greater than $100');
  assert.ok(matchRule(gt, ROWS[4]), 'income counts on absolute value');
  const lt = { conditions: { amount: { op: 'lt', value: 50 } } };
  assert.ok(matchRule(lt, ROWS[2]));
  assert.ok(!matchRule(lt, ROWS[3]), '$50.00 is not less than $50');
});

test('type (money in / out) can be the only condition', () => {
  assert.ok(matchRule({ amount_direction: 'credit' }, ROWS[4]));
  assert.ok(!matchRule({ amount_direction: 'credit' }, ROWS[0]));
  assert.ok(matchRule({ amount_direction: 'debit' }, ROWS[0]));
});

test('categories condition matches the transaction category group', () => {
  const rule = { conditions: { categories: ['Housing', 'Shopping'] } };
  assert.ok(matchRule(rule, ROWS[6]));
  assert.ok(!matchRule(rule, ROWS[0]), 'uncategorised raw row does not match');
});

test('date range is inclusive and rejects undated rows', () => {
  const rule = { conditions: { date: { from: '2026-03-01', to: '2026-03-04' } } };
  assert.ok(matchRule(rule, ROWS[0]));
  assert.ok(matchRule(rule, ROWS[1]), 'to-date is inclusive');
  assert.ok(matchRule(rule, ROWS[4]), 'from-date is inclusive');
  assert.ok(!matchRule(rule, ROWS[2]));
  assert.ok(!matchRule(rule, ROWS[7]), 'no post_date → no match');
  assert.ok(matchRule({ conditions: { date: { from: '2026-03-05' } } }, ROWS[6]), 'open-ended range');
  assert.ok(matchRule({ conditions: { date: { to: '2026-01-31' } } }, ROWS[3]));
  // node-postgres hands DATE columns back as local-midnight Date objects.
  assert.ok(matchRule({ conditions: { date: { from: '2026-03-02', to: '2026-03-02' } } }, { post_date: new Date(2026, 2, 2) }));
});

test('all conditions must hold (AND)', () => {
  const rule = {
    match_type: 'contains', match_text: 'myki', amount_direction: 'debit',
    conditions: { amount: { op: 'gt', value: 20 }, date: { from: '2026-01-01' } },
  };
  assert.ok(matchRule(rule, ROWS[3]));
  assert.ok(!matchRule({ ...rule, conditions: { amount: { op: 'gt', value: 60 } } }, ROWS[3]));
  assert.ok(!matchRule({ ...rule, match_text: 'opal' }, ROWS[3]));
});

test('legacy merchant-only rules behave as before', () => {
  assert.ok(matchRule({ match_type: 'contains', match_text: 'woolworths' }, ROWS[0]));
  assert.ok(matchRule({ match_type: 'starts_with', match_text: 'coles' }, ROWS[1]));
  assert.ok(!matchRule({ match_type: 'equals', match_text: 'coles' }, ROWS[1]));
  assert.ok(matchRule({ match_type: 'contains', match_text: 'opal', conditions: {} }, ROWS[2]));
});

console.log('\nnormaliseRuleInput');

test('rejects a rule with no conditions', () => {
  const r = normaliseRuleInput({ category_group: 'Other' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /condition/i);
});

test('accepts an amount-only rule and rounds to cents', () => {
  const r = normaliseRuleInput({ conditions: { amount: { op: 'gt', value: '100.004' } }, category_group: 'Shopping' });
  assert.ok(r.ok, r.error);
  assert.deepStrictEqual(r.rule.conditions, { amount: { op: 'gt', value: 100 } });
  assert.strictEqual(r.rule.match_text, '');
  assert.strictEqual(r.rule.amount_direction, 'any');
});

test('validates amount, categories, dates and the target category', () => {
  assert.strictEqual(normaliseRuleInput({ conditions: { amount: { op: 'gte', value: 1 } }, category_group: 'Other' }).ok, false);
  assert.strictEqual(normaliseRuleInput({ conditions: { amount: { op: 'gt', value: -5 } }, category_group: 'Other' }).ok, false);
  assert.strictEqual(normaliseRuleInput({ conditions: { categories: ['Nope'] }, category_group: 'Other' }).ok, false);
  assert.strictEqual(normaliseRuleInput({ conditions: { date: { from: '02/03/2026' } }, category_group: 'Other' }).ok, false);
  assert.strictEqual(normaliseRuleInput({ conditions: { date: { from: '2026-03-05', to: '2026-03-01' } }, category_group: 'Other' }).ok, false);
  assert.strictEqual(normaliseRuleInput({ match_text: 'opal' }).ok, false, 'create needs a category');
  assert.strictEqual(normaliseRuleInput({ match_text: 'opal', category_group: 'Food & Dining', category: 'Fuel' }).ok, false);
  const ok = normaliseRuleInput({ match_text: ' Opal ', category_group: 'Auto & Transport', category: 'Public transport' });
  assert.ok(ok.ok);
  assert.strictEqual(ok.rule.match_text, 'Opal');
});

test('previews do not need a target category; blank amount is ignored', () => {
  const r = normaliseRuleInput({ match_text: 'opal', conditions: { amount: { op: 'eq', value: '' } } }, { requireCategory: false });
  assert.ok(r.ok, r.error);
  assert.deepStrictEqual(r.rule.conditions, {});
  assert.strictEqual(r.rule.category_group, null);
});

test('unknown match_type / direction fall back to safe defaults', () => {
  const r = normaliseRuleInput({ match_text: 'x', match_type: 'regex', amount_direction: 'sideways', category_group: 'Other' });
  assert.strictEqual(r.rule.match_type, 'contains');
  assert.strictEqual(r.rule.amount_direction, 'any');
});

console.log('\npreview == apply parity');

test('withEffectiveCategory fills auto categories but keeps stored ones', () => {
  const rows = withEffectiveCategory(ROWS);
  assert.strictEqual(rows[0].category_group, 'Food & Dining');
  assert.strictEqual(rows[0].category_source, 'auto');
  assert.strictEqual(rows[6].category_group, 'Housing');
  assert.strictEqual(rows[6].category_source, 'rule');
});

test('categories condition sees auto categories (as the transactions list does)', () => {
  const ids = selectRuleMatches({ conditions: { categories: ['Auto & Transport'] } }, ROWS).map((r) => r.id);
  assert.deepStrictEqual(ids, [3, 4]);
});

test('hand-categorised transactions are never matched', () => {
  const ids = selectRuleMatches({ conditions: { amount: { op: 'gt', value: 1000 } } }, ROWS).map((r) => r.id);
  assert.deepStrictEqual(ids, [5], 'JB Hi-Fi (manual) excluded, salary included');
});

test('the preview lists exactly the transactions apply would update', () => {
  const rules = [
    { match_text: '', conditions: { amount: { op: 'gt', value: 99.99 } }, amount_direction: 'debit', category_group: 'Shopping', category: null },
    { match_text: 'myki', match_type: 'contains', conditions: {}, category_group: 'Auto & Transport', category: 'Public transport' },
    { match_text: '', conditions: { date: { from: '2026-03-01' }, categories: ['Income'] }, category_group: 'Income', category: 'Salary & wages' },
  ];
  for (const rule of rules) {
    const preview = previewRuleMatches(rule, ROWS, { limit: 200 });
    const applied = computeAssignments([rule], selectRuleMatches(rule, ROWS));
    assert.deepStrictEqual(preview.items.map((i) => i.id), applied.map((a) => a.transaction_id));
    assert.strictEqual(preview.total, applied.length);
    applied.forEach((a) => assert.strictEqual(a.category_group, rule.category_group));
  }
});

test('review-step selection only ever narrows the matches', () => {
  const { filterSelection } = require('../services/transaction-rules');
  const rule = { amount_direction: 'debit', conditions: { amount: { op: 'gt', value: 40 } } };
  const matches = selectRuleMatches(rule, ROWS);
  assert.deepStrictEqual(matches.map((r) => r.id), [1, 2, 4, 7, 8]);
  assert.deepStrictEqual(filterSelection(matches, {}).map((r) => r.id), [1, 2, 4, 7, 8]);
  assert.deepStrictEqual(filterSelection(matches, { exclude_ids: [2, '7'] }).map((r) => r.id), [1, 4, 8]);
  assert.deepStrictEqual(filterSelection(matches, { include_ids: [4, 5, 6] }).map((r) => r.id), [4],
    'ids outside the rule (5 = income, 6 = manual) are ignored');
  assert.deepStrictEqual(filterSelection(matches, { include_ids: [] }), []);
});

test('preview is capped and paginated; total counts every match', () => {
  const many = Array.from({ length: 260 }, (_, i) => ({ id: i + 1, description: 'OPAL TRIP', amount: -3.2, post_date: '2026-03-01' }));
  const rule = { match_text: 'opal' };
  const first = previewRuleMatches(rule, many);
  assert.strictEqual(first.total, 260);
  assert.strictEqual(first.items.length, 50, 'default page of 50');
  const capped = previewRuleMatches(rule, many, { limit: 10000 });
  assert.strictEqual(capped.items.length, 200, 'hard cap of 200');
  const page = previewRuleMatches(rule, many, { limit: 100, offset: 250 });
  assert.deepStrictEqual(page.items.map((i) => i.id), [251, 252, 253, 254, 255, 256, 257, 258, 259, 260]);
});

test('preview items carry numeric amounts and ISO dates', () => {
  const { items } = previewRuleMatches({ match_text: 'woolworths' }, ROWS);
  assert.deepStrictEqual(items[0], {
    id: 1, description: 'WOOLWORTHS 1234 SYDNEY', amount: -100, post_date: '2026-03-02',
    status: null, category_group: 'Food & Dining', category: 'Groceries',
  });
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
