'use strict';

// test/recurring-items.test.js
// Deterministic tests for shared/recurring.mjs — the Spending › Recurring
// page's next-date projection, frequency maths, monthly totals, input
// validation and the manual + detected merge behind
// GET /api/v1/transactions/recurring. No DB, no network; fixed local dates.

const assert = require('assert');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

(async () => {
  const m = await import('../shared/recurring.mjs');
  console.log('\nrecurring-items');
  const today = new Date(2026, 10, 22); // Sun 22 Nov 2026

  await test('parseDay rejects impossible dates and accepts timestamps', () => {
    assert.equal(m.parseDay('2026-02-30'), null);
    assert.equal(m.parseDay('nope'), null);
    assert.equal(m.isoDay(m.parseDay('2026-03-05T10:00:00.000Z')), '2026-03-05');
  });

  await test('monthly steps clamp to month end and keep the anchor day', () => {
    assert.deepStrictEqual(
      m.occurrencesBetween('2026-01-31', 'monthly', '2026-01-01', '2026-05-31'),
      ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'],
    );
    assert.deepStrictEqual(m.occurrencesBetween('2028-02-29', 'yearly', '2028-01-01', '2030-12-31'),
      ['2028-02-29', '2029-02-28', '2030-02-28']);
  });

  await test('weekly and fortnightly step by days across month ends', () => {
    assert.deepStrictEqual(m.occurrencesBetween('2026-11-26', 'weekly', '2026-11-22', '2026-12-12'),
      ['2026-11-26', '2026-12-03', '2026-12-10']);
    assert.deepStrictEqual(m.occurrencesBetween('2026-11-20', 'fortnightly', '2026-11-22', '2026-12-31'),
      ['2026-12-04', '2026-12-18']);
    assert.deepStrictEqual(m.occurrencesBetween('2026-11-20', 'quarterly', '2026-11-01', '2026-12-31'), [], 'unknown cadence → none');
  });

  await test('rollForward moves a stale next date to on/after today', () => {
    assert.equal(m.rollForward('2026-08-15', 'monthly', today), '2026-12-15');
    assert.equal(m.rollForward('2026-11-22', 'monthly', today), '2026-11-22', 'today counts');
    assert.equal(m.rollForward('2027-01-01', 'yearly', today), '2027-01-01', 'future stays');
    assert.equal(m.rollForward('bad', 'monthly', today), null);
  });

  await test('monthlyEquivalent and monthlyTotals', () => {
    assert.equal(m.monthlyEquivalent(100, 'weekly'), 433.33);
    assert.equal(m.monthlyEquivalent(-100, 'fortnightly'), 216.67);
    assert.equal(m.monthlyEquivalent('1200', 'yearly'), 100);
    assert.equal(m.monthlyEquivalent(50, 'daily'), 0);
    const t = m.monthlyTotals([
      { kind: 'bill', averageAmount: 1950, cadence: 'monthly' },
      { kind: 'subscription', averageAmount: 18.99, cadence: 'monthly' },
      { kind: 'subscription', amount: '120', cadence: 'yearly' },
      { kind: 'income', averageAmount: 2000, cadence: 'fortnightly' },
    ]);
    assert.deepStrictEqual(t, { bills: 1950, subscriptions: 28.99, income: 4333.33, outgoing: 1978.99, net: 2354.34 });
  });

  await test('fortnightWindow / offsetForDay', () => {
    const w = m.fortnightWindow(today, 0);
    assert.equal(w.length, 14);
    assert.equal(m.isoDay(w[0]), '2026-11-22');
    assert.equal(m.isoDay(m.fortnightWindow(today, 1)[0]), '2026-12-06');
    assert.equal(m.isoDay(m.fortnightWindow(new Date(2026, 10, 25), -1)[0]), '2026-11-08');
    assert.equal(m.offsetForDay('2026-12-05', today), 0);
    assert.equal(m.offsetForDay('2026-12-06', today), 1);
    assert.equal(m.offsetForDay('2026-11-21', today), -1);
  });

  await test('projectItems + summarise over a window', () => {
    const items = [
      { id: 'a', kind: 'bill', merchant: 'AGL', averageAmount: 132.55, cadence: 'monthly', nextEstimate: '2026-11-25' },
      { id: 'b', kind: 'subscription', merchant: 'Netflix', averageAmount: 18.99, cadence: 'monthly', nextEstimate: '2026-11-25' },
      { id: 'c', kind: 'income', merchant: 'Pay', averageAmount: 2000, cadence: 'fortnightly', nextEstimate: '2026-11-19' },
    ];
    const occ = m.projectItems(items, '2026-11-22', '2026-12-05');
    assert.deepStrictEqual(occ.map((o) => `${o.date} ${o.merchant}`), ['2026-11-25 AGL', '2026-11-25 Netflix', '2026-12-03 Pay']);
    const s = m.summarise(occ);
    assert.deepStrictEqual(s, { bills: { count: 1, total: 132.55 }, subscriptions: { count: 1, total: 18.99 }, income: { count: 1, total: 2000 }, outgoing: 151.54 });
    assert.equal(m.nextOccurrence(items, today).date, '2026-11-25');
    assert.equal(m.nextOccurrence([], today), null);
  });

  await test('validateRecurringInput normalises and rejects bad input', () => {
    const ok = m.validateRecurringInput({ name: '  Rent   Ray White ', amount: '$1,950.005', frequency: 'monthly', kind: 'bill', next_date: '2026-12-01' });
    assert.deepStrictEqual(ok.item, { name: 'Rent Ray White', amount: 1950.01, frequency: 'monthly', kind: 'bill', next_date: '2026-12-01' });
    assert.ok(m.validateRecurringInput({ name: '', amount: 5, frequency: 'monthly', kind: 'bill', next_date: '2026-12-01' }).error);
    assert.ok(m.validateRecurringInput({ name: 'X', amount: 0, frequency: 'monthly', kind: 'bill', next_date: '2026-12-01' }).error);
    assert.ok(m.validateRecurringInput({ name: 'X', amount: -5, frequency: 'monthly', kind: 'bill', next_date: '2026-12-01' }).error);
    assert.ok(m.validateRecurringInput({ name: 'X', amount: 5, frequency: 'daily', kind: 'bill', next_date: '2026-12-01' }).error);
    assert.ok(m.validateRecurringInput({ name: 'X', amount: 5, frequency: 'monthly', kind: 'gift', next_date: '2026-12-01' }).error);
    assert.ok(m.validateRecurringInput({ name: 'X', amount: 5, frequency: 'monthly', kind: 'bill', next_date: '2026-13-01' }).error);
    assert.deepStrictEqual(m.validateRecurringInput({ amount: 20 }, { partial: true }).item, { amount: 20 });
    assert.ok(m.validateRecurringInput({}, { partial: true }).error);
  });

  await test('mergeRecurring: manual added, edits replace, dismiss hides, confirm flags', () => {
    const detected = [
      { kind: 'bill', merchant: 'Agl Energy', merchant_key: 'agl energy', averageAmount: 190, cadence: 'monthly', nextEstimate: '2026-12-05', confidence: 0.9 },
      { kind: 'subscription', merchant: 'Netflix', merchant_key: 'netflix', averageAmount: 18.99, cadence: 'monthly', nextEstimate: '2026-11-28', confidence: 0.95 },
      { kind: 'subscription', merchant: 'Spotify', merchant_key: 'spotify', averageAmount: 13.99, cadence: 'monthly', nextEstimate: '2026-11-30', confidence: 0.95 },
    ];
    const rows = [
      { id: 7, name: 'Gym', amount: '21.95', frequency: 'fortnightly', kind: 'bill', next_date: '2026-11-01', status: 'active', source_key: null },
      { id: 8, name: 'AGL (fixed plan)', amount: '175.00', frequency: 'monthly', kind: 'bill', next_date: new Date(2026, 11, 7), status: 'active', source_key: 'agl energy' },
      { id: 9, name: null, amount: null, frequency: null, kind: null, next_date: null, status: 'dismissed', source_key: 'spotify' },
      { id: 10, name: null, amount: null, frequency: null, kind: null, next_date: null, status: 'confirmed', source_key: 'netflix' },
    ];
    const out = m.mergeRecurring(detected, rows, today);
    assert.deepStrictEqual(out.map((o) => `${o.source}:${o.merchant}`), ['detected:Netflix', 'manual:Gym', 'manual:AGL (fixed plan)']);
    const gym = out[1];
    assert.equal(gym.id, 'manual:7');
    assert.equal(gym.averageAmount, 21.95);
    assert.equal(gym.nextEstimate, '2026-11-29', 'stale manual date rolls forward by fortnights');
    assert.equal(out[0].confirmed, true);
    assert.equal(out[0].id, 'detected:netflix');
    assert.equal(out[0].confidence, 0.95, 'detected fields preserved (backward compatible)');
    assert.equal(out[2].nextEstimate, '2026-12-07');
    assert.deepStrictEqual(m.mergeRecurring(detected, [], today).map((o) => o.source), ['detected', 'detected', 'detected']);
  });

  await test('suggestKind / suggestNextDate for a picked transaction', () => {
    assert.equal(m.suggestKind({ amount: 5 }), 'income');
    assert.equal(m.suggestKind({ amount: -18.99, description: 'NETFLIX.COM' }), 'subscription');
    assert.equal(m.suggestKind({ amount: -18.99, category_group: 'Recurring & Subscriptions' }), 'subscription');
    assert.equal(m.suggestKind({ amount: -132, description: 'AGL ENERGY' }), 'bill');
    assert.equal(m.suggestNextDate('2026-11-19', 'monthly', today), '2026-12-19');
    assert.equal(m.suggestNextDate('2026-08-19', 'monthly', today), '2026-12-19');
    assert.equal(m.suggestNextDate('2026-11-20', 'weekly', today), '2026-11-27');
  });

  await test('creditCardPayments groups recent card repayments, newest first', () => {
    const rows = m.creditCardPayments([
      { post_date: '2026-11-10', amount: '-620', description: 'Card payment CommBank', institution: 'CommBank', category_group: 'Credit Card Payments' },
      { post_date: '2026-10-10', amount: '-540', description: 'Card payment CommBank', institution: 'CommBank', category_group: 'Credit Card Payments' },
      { post_date: '2026-11-02', amount: -80, description: 'AMEX PAYMENT', category_group: 'Credit Card Payments' },
      { post_date: '2026-03-02', amount: -99, description: 'OLD CARD', category_group: 'Credit Card Payments' },
      { post_date: '2026-11-12', amount: -50, description: 'Woolworths', category_group: 'Food & Dining' },
    ], today);
    assert.deepStrictEqual(rows.map((r) => [r.name, r.lastAmount, r.lastDate, r.count]), [
      ['Card payment CommBank', 620, '2026-11-10', 2],
      ['AMEX PAYMENT', 80, '2026-11-02', 1],
    ]);
    assert.deepStrictEqual(m.creditCardPayments([], today), []);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
