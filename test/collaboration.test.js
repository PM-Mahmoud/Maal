'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { serializeFinancialExport } = require('../lib/financial-export');
const {
  DELETION_CONFIRMATION,
  READ_SCOPES,
  normalizeEmail,
  normalizeHouseholdName,
  normalizeOwnership,
  normalizeOwnershipAllocations,
  normalizeGrant,
  isGrantActive,
  hasScope,
  isDeletionConfirmed,
} = require('../lib/collaboration');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('\nBuild 8 collaboration policy');

test('normalises household input without accepting blank names', () => {
  assert.equal(normalizeHouseholdName('  Family wealth  '), 'Family wealth');
  assert.throws(() => normalizeHouseholdName('   '), /required/);
  assert.equal(normalizeEmail(' Adviser@Example.COM '), 'adviser@example.com');
});

test('ownership is bounded and preserves two decimal places', () => {
  assert.equal(normalizeOwnership(undefined), 100);
  assert.equal(normalizeOwnership('50.125'), 50.13);
  assert.throws(() => normalizeOwnership(-1), /between 0 and 100/);
  assert.throws(() => normalizeOwnership(100.01), /between 0 and 100/);
});

test('household allocations require unique members and cannot exceed 100 percent', () => {
  assert.deepStrictEqual(normalizeOwnershipAllocations([
    { userId: 1, ownershipPercent: 60 },
    { user_id: '2', ownership_percent: '40' },
  ]), [
    { userId: '1', ownershipPercent: 60 },
    { userId: '2', ownershipPercent: 40 },
  ]);
  assert.throws(() => normalizeOwnershipAllocations([]), /At least one/);
  assert.throws(() => normalizeOwnershipAllocations([{ userId: 1, ownershipPercent: 0 }]), /greater than zero/);
  assert.throws(() => normalizeOwnershipAllocations([
    { userId: 1, ownershipPercent: 50 }, { userId: 1, ownershipPercent: 50 },
  ]), /only appear once/);
  assert.throws(() => normalizeOwnershipAllocations([
    { userId: 1, ownershipPercent: 60 }, { userId: 2, ownershipPercent: 41 },
  ]), /cannot exceed 100/);
});

test('grants accept only read-only roles and allow-listed scopes', () => {
  assert.deepStrictEqual(normalizeGrant({
    email: 'Accountant@example.com', role: 'accountant', scopes: ['overview', 'documents', 'overview'],
  }), { email: 'accountant@example.com', role: 'accountant', scopes: ['overview', 'documents'], expiresAt: null });
  assert.deepStrictEqual(READ_SCOPES, ['overview', 'transactions', 'documents', 'tax_export']);
  assert.throws(() => normalizeGrant({ email: 'a@example.com', role: 'admin' }), /accountant or adviser/);
  assert.throws(() => normalizeGrant({ email: 'a@example.com', role: 'adviser', scopes: ['write'] }), /scopes/);
});

test('active access requires an accepted, unexpired grant and matching scope', () => {
  const grant = { status: 'active', grantee_user_id: 2, scopes: ['overview'], expires_at: '2099-01-01T00:00:00Z' };
  assert.equal(isGrantActive(grant, new Date('2026-01-01T00:00:00Z')), true);
  assert.equal(hasScope(grant, 'overview'), true);
  assert.equal(hasScope(grant, 'documents'), false);
  assert.equal(isGrantActive({ ...grant, status: 'pending' }), false);
  assert.equal(isGrantActive({ ...grant, expires_at: '2020-01-01T00:00:00Z' }, new Date('2026-01-01T00:00:00Z')), false);
});

test('account deletion requires an exact, explicit confirmation phrase', () => {
  assert.equal(DELETION_CONFIRMATION, 'DELETE MY ACCOUNT');
  assert.equal(isDeletionConfirmed(' delete my account '), true);
  assert.equal(isDeletionConfirmed('DELETE ACCOUNT'), false);
  assert.equal(isDeletionConfirmed(''), false);
});

test('tax export metadata stays outside the row-oriented CSV data envelope', () => {
  const bundle = {
    exported_at: '2026-08-27T00:00:00.000Z', schema_version: 1,
    export_type: 'tax_ready', tax_year: 2026, tax_year_start: '2025-07-01', tax_year_end: '2026-07-01',
    data: { transactions: [], supporting_documents: [] },
  };
  assert.doesNotThrow(() => serializeFinancialExport(bundle, 'csv'));
});

test('database access methods keep owner, member, grant and vault links tenant-scoped', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'db', 'collaboration.js'), 'utf8');
  assert.match(source, /hm\.user_id = \$1/);
  assert.match(source, /h\.id = \$1 AND hm\.user_id = \$2/);
  assert.match(source, /owner\.user_id = \$2/);
  assert.match(source, /owner_user_id = \$2/);
  assert.match(source, /grantee_user_id = \$1/);
  assert.match(source, /vault_files\.id = \$2 AND vault_files\.user_id = \$1/);
  assert.match(source, /d\.id = \$1 AND d\.user_id = \$2/);
  assert.match(source, /subject_owner\.household_id = \$1 AND subject_owner\.user_id = \$3/);
  assert.match(source, /oi\.household_id = \$1/);
});

test('household ownership migration binds interests to real household members', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'migrations', '1756300000000_household_ownership.js'), 'utf8');
  assert.match(source, /ADD COLUMN IF NOT EXISTS household_id/);
  assert.match(source, /ADD COLUMN IF NOT EXISTS owner_user_id/);
  assert.match(source, /REFERENCES household_members\(household_id, user_id\)/);
  assert.match(source, /ownership_household_pair_check/);
});

console.log(`\n${passed} collaboration tests passed`);
