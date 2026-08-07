'use strict';

const assert = require('assert');
const {
  projectLegacyWealthRows,
  summarizeCanonicalSnapshot,
  compareLegacyAndCanonical,
  normalizeMinorUnitInteger,
} = require('../lib/canonical-wealth');

assert.strictEqual(normalizeMinorUnitInteger('9007199254740993'), '9007199254740993', 'large minor-unit values remain exact strings');
assert.throws(() => normalizeMinorUnitInteger(9007199254740993), /safe integer/, 'unsafe JSON numbers are rejected');
assert.throws(() => normalizeMinorUnitInteger('12.34'), /64-bit integer/, 'minor units cannot contain decimals');

const legacy = {
  cashAccounts: [{ id: 1, label: 'Offset', institution: 'Bank', balance: '25000', currency: 'AUD', source: 'manual', updated_at: '2026-08-01T00:00:00Z' }],
  investments: [{ id: 2, name: 'Global ETF', kind: 'etf', ticker: 'VGS', units: '12.345678', value: '18000', cost_basis: '15000', currency: 'AUD', source: 'import', updated_at: '2026-08-02T00:00:00Z' }],
  properties: [{ id: 3, label: 'Investment property', value: '700000', mortgage_balance: '430000', source: 'manual', updated_at: '2026-08-03T00:00:00Z' }],
  debts: [{ id: 4, label: 'Card', kind: 'credit_card', balance: '2000', source: 'manual', updated_at: '2026-08-04T00:00:00Z' }],
  superAccounts: [{ id: 5, label: 'Super', fund_name: 'Fund', balance: '110000', source: 'basiq', updated_at: '2026-08-05T00:00:00Z' }],
  otherAssets: [{ id: 6, label: 'Gold', kind: 'metal', value: '9000', updated_at: '2026-08-06T00:00:00Z' }],
};

const projected = projectLegacyWealthRows(42, legacy);

assert.strictEqual(projected.accounts.length, 4, 'cash, investment, debt and super become financial accounts');
assert.strictEqual(projected.instruments.length, 1);
assert.strictEqual(projected.holdings.length, 1);
assert.strictEqual(projected.holdings[0].units, '12.345678', 'security quantities retain precision');
assert.strictEqual(projected.holdings[0].costBasisMinor, 1500000, 'legacy AUD values convert to cents');
assert.ok(projected.valuations.every((row) => row.currency === 'AUD'));
assert.ok(projected.valuations.every((row) => row.asOf), 'every amount has an as-of time');
assert.ok(projected.valuations.every((row) => row.source), 'every amount has provenance');
assert.deepStrictEqual(
  projected.ownershipInterests.map((row) => row.ownershipPercent),
  projected.ownershipInterests.map(() => 100),
  'legacy sole-owner records default to 100 percent ownership'
);

const keys = projected.accounts.concat(projected.instruments, projected.holdings, projected.valuations, projected.ownershipInterests)
  .map((row) => row.legacyKey);
assert.strictEqual(new Set(keys).size, keys.length, 'legacy projection keys are deterministic and unique');
assert.deepStrictEqual(projectLegacyWealthRows(42, legacy), projected, 'projection is idempotent');

const summary = summarizeCanonicalSnapshot(projected);
assert.deepStrictEqual(summary, {
  cashTotal: 25000,
  investmentsTotal: 18000,
  propertyTotal: 700000,
  propertyMortgageTotal: 430000,
  debtsTotal: 2000,
  superTotal: 110000,
  otherAssetsTotal: 9000,
  assetTotal: 862000,
  liabilityTotal: 432000,
  netWorth: 430000,
});

assert.deepStrictEqual(compareLegacyAndCanonical(legacy, projected), {
  legacySummary: summary,
  canonicalSummary: summary,
  legacyNetWorth: 430000,
  canonicalNetWorth: 430000,
  delta: 0,
  matches: true,
});

const revised = structuredClone(projected);
revised.valuations.push({
  ...revised.valuations.find((row) => row.legacyKey.startsWith('cash_accounts:1:valuation:')),
  legacyKey: 'cash_accounts:1:valuation:revision-2',
  amountMinor: 3000000,
  asOf: '2026-08-07T00:00:00Z',
});
assert.strictEqual(summarizeCanonicalSnapshot(revised).cashTotal, 30000, 'latest append-only valuation wins');

const jointlyOwned = structuredClone(projected);
jointlyOwned.ownershipInterests.find((row) => row.subjectKey === 'properties:3').ownershipPercent = 50;
assert.strictEqual(summarizeCanonicalSnapshot(jointlyOwned).propertyTotal, 350000, 'valuations are weighted by ownership');
assert.strictEqual(summarizeCanonicalSnapshot(jointlyOwned).propertyMortgageTotal, 215000, 'related liabilities use the same ownership share');

const foreignCurrency = structuredClone(projected);
foreignCurrency.valuations[0].currency = 'USD';
assert.throws(
  () => summarizeCanonicalSnapshot(foreignCurrency),
  /FX conversion required/,
  'mixed currencies must never be added at face value'
);

const offsettingError = structuredClone(projected);
offsettingError.valuations.find((row) => row.classification === 'cash').amountMinor += 10000;
offsettingError.valuations.find((row) => row.classification === 'debt').amountMinor += 10000;
assert.strictEqual(compareLegacyAndCanonical(legacy, offsettingError).matches, false, 'component errors cannot pass on net worth alone');

console.log('✓ canonical wealth projection preserves precision, provenance, ownership and parity');
