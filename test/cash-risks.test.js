const assert = require('assert');
const { detectCashRisks } = require('../lib/cash-risks');
const risks = detectCashRisks({
  accounts: [{ account_reference: 'a', label: 'Everyday', points: [
    { date: '2026-08-07', balance: 100 }, { date: '2026-08-10', balance: -50 }, { date: '2026-08-11', balance: 20 },
  ] }],
  recurring: [{ kind: 'bill', merchant: 'Rent', averageAmount: 600, nextEstimate: '2026-08-10', confidence: 0.9 }],
}, { threshold: 50 });
assert.equal(risks.shortfalls[0].date, '2026-08-10');
assert.equal(risks.shortfalls[0].amount_needed, 100);
assert.equal(risks.upcoming_obligations[0].merchant, 'Rent');
assert.equal(risks.status, 'shortfall');
console.log('✓ cash risks identify shortfalls, buffers, and upcoming obligations');
