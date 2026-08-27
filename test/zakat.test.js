'use strict';

const assert = require('assert');
const { calculateZakat, METHODOLOGIES } = require('../lib/zakat');

const result = calculateZakat({
  methodology: METHODOLOGIES.LUNAR_V1,
  valuationDate: '2026-08-09',
  nisabMinor: '600000',
  lines: [
    { key: 'cash', category: 'cash', amountMinor: '1000000', ownershipPercent: 100, confirmed: true },
    { key: 'shares', category: 'listed_shares', amountMinor: '500000', ownershipPercent: 50, confirmed: true },
    { key: 'super', category: 'super', amountMinor: '300000', accessible: false, confirmed: false },
    { key: 'rental', category: 'property', amountMinor: '5000000', propertyIntention: 'rental', confirmed: true },
    { key: 'inventory', category: 'business_inventory', amountMinor: '200000', ownershipPercent: 100, confirmed: true },
    { key: 'debt', category: 'deductible_debt', amountMinor: '100000', dueWithinMonths: 12, confirmed: true },
  ],
});

assert.equal(result.status, 'needs_confirmation');
assert.deepStrictEqual(result.unconfirmedLineKeys, ['super']);
assert.equal(result.eligibleAssetsMinor, '1450000');
assert.equal(result.deductibleDebtsMinor, '100000');
assert.equal(result.zakatableBaseMinor, '1350000');
assert.equal(result.zakatDueMinor, '33750');
assert.equal(result.aboveNisab, true);
assert.equal(result.lines.find((line) => line.key === 'shares').ownedAmountMinor, '250000');
assert.equal(result.lines.find((line) => line.key === 'rental').treatment, 'excluded');
assert.equal(result.lines.find((line) => line.key === 'super').treatment, 'disputed');

const below = calculateZakat({
  methodology: METHODOLOGIES.SOLAR_V1,
  valuationDate: '2026-08-09', nisabMinor: '600000',
  lines: [{ key: 'cash', category: 'cash', amountMinor: '599999', confirmed: true }],
});
assert.equal(below.zakatDueMinor, '0');
assert.equal(below.ratePartsPerMillion, 25775);

assert.throws(() => calculateZakat({ methodology: METHODOLOGIES.LUNAR_V1, valuationDate: 'bad', nisabMinor: '1', lines: [] }), /valuation date/);
assert.throws(() => calculateZakat({ methodology: METHODOLOGIES.LUNAR_V1, valuationDate: '2026-08-09', nisabMinor: '1', lines: [{ key: 'usd', category: 'cash', amountMinor: '100', currency: 'USD', confirmed: true }] }), /AUD presentation/);

console.log('✓ zakat golden cases preserve ownership, disputed treatment, nisab and exact rates');

assert.throws(() => calculateZakat({ methodology: METHODOLOGIES.LUNAR_V1, valuationDate: '2026-06-30', nisabMinor: '1', lines: [{ key: 'negative', category: 'cash', amountMinor: '-1', confirmed: true }] }), /cannot be negative/);
const unclassifiedDebt = calculateZakat({ methodology: METHODOLOGIES.LUNAR_V1, valuationDate: '2026-06-30', nisabMinor: '1', lines: [{ key: 'debt', category: 'deductible_debt', amountMinor: '100', dueWithinMonths: null, confirmed: false }] });
assert.equal(unclassifiedDebt.lines[0].treatment, 'disputed');
