'use strict';

// test/report-url.test.js
// Deterministic tests for shared/report-url.mjs — Reports settings in the URL:
// whitelist validation, defaults, round trip, and that the merchant text
// filter never reaches the URL. No DB, no network.

const assert = require('assert');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

(async () => {
  const u = await import('../shared/report-url.mjs');
  console.log('\nreport-url');

  await test('junk params fall back to defaults and are never reflected', () => {
    const s = u.parseReportSearch({ tab: '<script>alert(1)</script>', preset: 'forever', interval: 'day', chart: 'pie', viewBy: 'x', groups: ['<img src=x>', 'Housing'], view: '../../etc', merchant: 'Woolworths' });
    assert.deepStrictEqual(s, { groups: ['Housing'] });
    const c = u.configFromSearch({ tab: '<script>' });
    assert.deepStrictEqual(c, { tab: 'cashflow', chart: 'net', interval: 'month', viewBy: 'category', range: { preset: '6m' }, groups: [] });
    assert.deepStrictEqual(u.parseReportSearch(null), {});
    assert.deepStrictEqual(u.parseReportSearch('tab=income'), {});
  });

  await test('valid params are kept', () => {
    const s = u.parseReportSearch({ tab: 'expenses', preset: '12m', interval: 'quarter', chart: 'donut', viewBy: 'merchant', groups: ['Shopping', 'Housing', 'Shopping'], view: '42' });
    assert.deepStrictEqual(s, { tab: 'expenses', preset: '12m', interval: 'quarter', chart: 'donut', viewBy: 'merchant', groups: ['Housing', 'Shopping'], view: '42' });
    assert.deepStrictEqual(u.parseReportSearch({ groups: 'Housing,Food & Dining' }).groups, ['Housing', 'Food & Dining']);
    assert.strictEqual(u.parseReportSearch({ view: 7 }).view, '7');
  });

  await test('chart must suit the tab', () => {
    assert.strictEqual(u.parseReportSearch({ tab: 'expenses', chart: 'flow' }).chart, undefined);
    assert.strictEqual(u.parseReportSearch({ chart: 'donut' }).chart, undefined); // default tab is cash flow
    assert.strictEqual(u.configFromSearch({ tab: 'income' }).chart, 'bars');
  });

  await test('custom range needs two real, ordered days', () => {
    assert.deepStrictEqual(u.parseReportSearch({ preset: 'custom', from: '2026-01-01', to: '2026-03-31' }), { preset: 'custom', from: '2026-01-01', to: '2026-03-31' });
    assert.deepStrictEqual(u.parseReportSearch({ preset: 'custom', from: '2026-02-30', to: '2026-03-31' }), {});
    assert.deepStrictEqual(u.parseReportSearch({ preset: 'custom', from: '2026-04-01', to: '2026-03-31' }), {});
    assert.deepStrictEqual(u.parseReportSearch({ preset: '3m', from: '2026-01-01', to: '2026-03-31' }), { preset: '3m' });
  });

  await test('merchant filter never goes into the URL', () => {
    const cfg = { tab: 'expenses', chart: 'bars', interval: 'week', viewBy: 'merchant', range: { preset: 'ytd' }, filters: { groups: ['Shopping'], merchant: 'Secret Shop' } };
    const s = u.searchFromConfig(cfg, '9');
    assert.deepStrictEqual(s, { tab: 'expenses', interval: 'week', viewBy: 'merchant', preset: 'ytd', groups: ['Shopping'], view: '9' });
    assert.ok(!JSON.stringify(s).includes('Secret'));
  });

  await test('defaults are left out; round trip is stable', () => {
    assert.deepStrictEqual(u.searchFromConfig({ tab: 'cashflow', chart: 'net', interval: 'month', viewBy: 'category', range: { preset: '6m' }, filters: { groups: [], merchant: '' } }, null), {});
    const cfg = { tab: 'income', chart: 'donut', interval: 'quarter', viewBy: 'category', range: { preset: 'custom', from: '2025-07-01', to: '2026-06-30' }, filters: { groups: ['Income'], merchant: '' } };
    const back = u.configFromSearch(u.searchFromConfig(cfg));
    assert.deepStrictEqual(back, { tab: 'income', chart: 'donut', interval: 'quarter', viewBy: 'category', range: { preset: 'custom', from: '2025-07-01', to: '2026-06-30' }, groups: ['Income'] });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
