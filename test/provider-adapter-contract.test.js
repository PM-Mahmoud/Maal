'use strict';

const assert = require('assert');
const { validateProviderAdapter, createProviderRegistry } = require('../lib/provider-adapter-contract');
const lunchflow = require('../services/lunchflow');

const manifest = validateProviderAdapter(lunchflow);
assert.deepStrictEqual(manifest.scopes, ['accounts:read', 'balances:read', 'transactions:read', 'holdings:read']);
assert.equal(createProviderRegistry([lunchflow]).get('lunchflow').manifest.region, 'AU');
assert.throws(() => validateProviderAdapter({ manifest: { id: 'bad', name: 'Bad', region: 'AU', scopes: ['read'] } }), /missing isConfigured/);
assert.throws(() => validateProviderAdapter({
  ...lunchflow,
  getHoldings: undefined,
  manifest: { ...lunchflow.manifest, id: 'missing-holdings' },
}), /declares holdings but is missing getHoldings/);
assert.throws(() => createProviderRegistry([lunchflow, lunchflow]), /Duplicate provider/);

console.log('✓ provider adapters declare scopes and satisfy the durable ingestion contract');
