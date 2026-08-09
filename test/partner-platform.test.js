'use strict';

const assert = require('assert');
const { validateManifest, visibleOfferings, createConsent } = require('../lib/partner-platform');

const approved = { partnerKey: 'zakat-pro', name: 'Zakat Pro', status: 'approved', enabled: true, sponsored: true, rank: 20, scopes: ['wealth:read'], fields: ['asset_class', 'aud_value'] };
const disabled = { partnerKey: 'trade-now', name: 'Trade Now', status: 'approved', enabled: false, sponsored: false, rank: 1, scopes: ['trade:write'], fields: [] };
assert.deepStrictEqual(visibleOfferings([approved, disabled], { marketplaceApproved: false }), []);
assert.deepStrictEqual(visibleOfferings([approved, disabled], { marketplaceApproved: true }).map(x => x.partnerKey), ['zakat-pro']);
assert.equal(visibleOfferings([{ ...approved, sponsored: false, rank: 30 }, { ...approved, partnerKey: 'organic', sponsored: true, rank: 10 }], { marketplaceApproved: true })[0].partnerKey, 'organic', 'ranking is explicit and never derived from sponsorship');

assert.throws(() => validateManifest({ ...approved, scopes: ['trade:execute'] }), /unsupported scope/);
const consent = createConsent(approved, { scopes: ['wealth:read'], fields: ['aud_value'], durationDays: 30 }, new Date('2026-01-01T00:00:00Z'));
assert.deepStrictEqual(consent.scopes, ['wealth:read']);
assert.deepStrictEqual(consent.fields, ['aud_value']);
assert.equal(consent.expiresAt, '2026-01-31T00:00:00.000Z');
assert.throws(() => createConsent(approved, { scopes: ['wealth:write'], fields: [], durationDays: 30 }), /not declared/);

console.log('✓ partner registry enforces approval, explicit consent, scopes and sponsor-independent ranking');
