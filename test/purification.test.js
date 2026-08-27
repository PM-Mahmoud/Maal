'use strict';

const assert = require('assert');
const { calculatePurification, METHODOLOGY } = require('../lib/purification');

const result = calculatePurification({
  methodology: METHODOLOGY,
  periodStart: '2025-07-01', periodEnd: '2026-06-30',
  positions: [{
    securityKey: 'isin:AU0000000001', name: 'Example ETF', acquiredOn: '2025-01-10', disposedOn: null,
    ratio: { partsPerMillion: 32000, provider: 'Licensed Data Co', datasetVersion: '2026-Q2', licenseReference: 'LIC-42', asOf: '2026-06-30' },
    distributions: [
      { key: 'dist-1', paidOn: '2025-09-15', grossMinor: '100000', currency: 'AUD', source: 'broker_statement' },
      { key: 'dist-2', paidOn: '2026-03-15', grossMinor: '50000', currency: 'AUD', source: 'broker_statement' },
    ],
  }],
});

assert.equal(result.status, 'calculated');
assert.equal(result.totalDistributionsMinor, '150000');
assert.equal(result.totalDueMinor, '4800');
assert.equal(result.lines[0].amountDueMinor, '3200');
assert.equal(result.lines[0].provider, 'Licensed Data Co');
assert.equal(result.obligations[0].status, 'outstanding');
assert.match(result.disclaimer, /not.*endorsement/i);

const disposed = calculatePurification({
  methodology: METHODOLOGY, periodStart: '2025-07-01', periodEnd: '2026-06-30',
  positions: [{
    securityKey: 'ticker:ASX:OLD', name: 'Disposed Ltd', acquiredOn: '2025-01-01', disposedOn: '2025-12-01',
    ratio: { partsPerMillion: 100000, provider: 'Licensed', datasetVersion: 'v1', licenseReference: 'L1', asOf: '2025-12-01' },
    distributions: [{ key: 'before', paidOn: '2025-10-01', grossMinor: '10000', currency: 'AUD' }, { key: 'after', paidOn: '2026-01-01', grossMinor: '10000', currency: 'AUD' }],
  }],
});
assert.equal(disposed.totalDueMinor, '1000', 'disposal does not erase obligations on distributions received while held');
assert.equal(disposed.lines.length, 1);

const unavailable = calculatePurification({
  methodology: METHODOLOGY, periodStart: '2025-07-01', periodEnd: '2026-06-30',
  positions: [{ securityKey: 'ticker:ASX:MISS', name: 'Missing Ratio', acquiredOn: '2025-01-01', distributions: [{ key: 'd', paidOn: '2025-08-01', grossMinor: '1000', currency: 'AUD' }] }],
});
assert.equal(unavailable.status, 'unavailable');
assert.deepStrictEqual(unavailable.warnings, ['Missing licensed purification ratio for Missing Ratio']);
assert.equal(unavailable.totalDueMinor, null);

assert.throws(() => calculatePurification({ methodology: METHODOLOGY, periodStart: '2025-07-01', periodEnd: '2026-06-30', positions: [{ securityKey: 'x', name: 'X', acquiredOn: '2025-01-01', ratio: { partsPerMillion: 1, provider: 'p', datasetVersion: 'v', licenseReference: 'l', asOf: '2025-01-01' }, distributions: [{ key: 'd', paidOn: '2025-08-01', grossMinor: '100', currency: 'USD' }] }] }), /AUD presentation/);
assert.throws(() => calculatePurification({ methodology: METHODOLOGY, periodStart: '2025-07-01', periodEnd: '2026-06-30', positions: [{ securityKey: 'x', name: 'X', acquiredOn: '2025-01-01', ratio: { partsPerMillion: 1, provider: 'p', datasetVersion: 'v', licenseReference: 'l', asOf: '2025-01-01' }, distributions: [{ key: 'd', paidOn: '2025-08-01', grossMinor: '-1', currency: 'AUD' }] }] }), /cannot be negative/);

console.log('✓ purification golden cases preserve licensed ratios, holding periods and obligation history');
