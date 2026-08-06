const assert = require('assert');
const { explainSnapshotChange, explainSnapshotSeries } = require('../lib/snapshot-changes');

const explanation = explainSnapshotChange(
  { snap_date: '2026-08-06', net_worth: 10000, assets_total: 12000, super_balance: 4000, invest_balance: 3000, cash_balance: 2000, debts_total: 2000 },
  { snap_date: '2026-08-07', net_worth: 10800, assets_total: 12600, super_balance: 4100, invest_balance: 3500, cash_balance: 1900, debts_total: 1800 }
);
assert.equal(explanation.net_change, 800);
assert.equal(explanation.summary, 'Net worth increased by $800.00, mainly from investments and lower debt.');
assert.deepStrictEqual(explanation.contributors.map((item) => [item.category, item.impact]), [
  ['investments', 500], ['debt', 200], ['super', 100], ['other assets', 100], ['cash', -100],
]);
assert.equal(explainSnapshotChange(
  { snap_date: '2026-08-06', net_worth: 10000 },
  { snap_date: '2026-08-07', net_worth: 10040 }
).material, false);
const combined = explainSnapshotChange(
  { snap_date: '2026-08-06', net_worth: 10000, assets_total: 10000, invest_balance: 3000, cash_balance: 2000 },
  { snap_date: '2026-08-07', net_worth: 10120, assets_total: 10120, invest_balance: 3060, cash_balance: 2060 }
);
assert.equal(combined.material, true);
assert.match(combined.summary, /investments and cash/);
assert.equal(explainSnapshotSeries([{ snap_date: '2026-08-06', net_worth: 1 }])[0].change, null);
console.log('✓ snapshot changes explain material component movements without noise');
