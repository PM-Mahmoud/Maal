'use strict';
// test/profile-details.test.js — Settings → Profile validation, DOB→age and
// SMS phone-verification helpers (lib/profile-details.js). Pure, clock injected.

const assert = require('assert');
const pd = require('../lib/profile-details');
const { normalizeProfile, profilePatchToColumns } = require('../db/profiles');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

const NOW = new Date(Date.UTC(2026, 10, 16)); // 16 Nov 2026

console.log('\nageFromDob');
test('whole years, birthday not yet reached this year', () => {
  assert.strictEqual(pd.ageFromDob('1995-11-17', NOW), 30);
  assert.strictEqual(pd.ageFromDob('1995-11-16', NOW), 31);
  assert.strictEqual(pd.ageFromDob('1995-02-18', NOW), 31);
});
test('rejects malformed and rolled-over dates', () => {
  assert.strictEqual(pd.ageFromDob('18/02/1995', NOW), null);
  assert.strictEqual(pd.ageFromDob('2001-02-30', NOW), null);
  assert.strictEqual(pd.ageFromDob(null, NOW), null);
});

console.log('\nvalidateProfileDetails');
test('only keys present are returned; unrelated keys ignored', () => {
  const { details, errors } = pd.validateProfileDetails({ legal_name: '  Mahmoud   Abumarzouq ', annual_income: 1 }, NOW);
  assert.deepStrictEqual(details, { legal_name: 'Mahmoud Abumarzouq' });
  assert.deepStrictEqual(errors, {});
});
test('date of birth: valid, too young, future/implausible, cleared', () => {
  assert.deepStrictEqual(pd.validateProfileDetails({ date_of_birth: '1995-02-18' }, NOW).details, { date_of_birth: '1995-02-18' });
  assert.ok(pd.validateProfileDetails({ date_of_birth: '2015-01-01' }, NOW).errors.date_of_birth);
  assert.ok(pd.validateProfileDetails({ date_of_birth: '1890-01-01' }, NOW).errors.date_of_birth);
  assert.ok(pd.validateProfileDetails({ date_of_birth: 'nope' }, NOW).errors.date_of_birth);
  assert.deepStrictEqual(pd.validateProfileDetails({ date_of_birth: '' }, NOW).details, { date_of_birth: null });
});
test('AU address: state/territory + 4-digit postcode required', () => {
  const ok = pd.validateProfileDetails({ address: { line1: '1 George St', suburb: 'Sydney', state: 'nsw', postcode: '2000' } }, NOW);
  assert.deepStrictEqual(ok.details.address, { line1: '1 George St', suburb: 'Sydney', state: 'NSW', postcode: '2000' });
  assert.ok(pd.validateProfileDetails({ address: { line1: '1 George St', suburb: 'Sydney', state: 'CA', postcode: '2000' } }, NOW).errors.address);
  assert.ok(pd.validateProfileDetails({ address: { line1: '1 George St', suburb: 'Sydney', state: 'NSW', postcode: '94025' } }, NOW).errors.address);
  assert.ok(pd.validateProfileDetails({ address: { line1: '', suburb: 'Sydney', state: 'NSW', postcode: '2000' } }, NOW).errors.address);
  assert.deepStrictEqual(pd.validateProfileDetails({ address: { line1: '', suburb: '', state: '', postcode: '' } }, NOW).details, { address: null });
  assert.ok(pd.validateProfileDetails({ address: 'a string' }, NOW).errors.address);
});
test('enumerations and dependants', () => {
  assert.deepStrictEqual(pd.validateProfileDetails({ employment_status: 'casual', tax_residency: 'resident', dependants: '2' }, NOW).details,
    { employment_status: 'casual', tax_residency: 'resident', dependants: 2 });
  const bad = pd.validateProfileDetails({ employment_status: 'astronaut', tax_residency: 'single', dependants: 2.5 }, NOW).errors;
  assert.ok(bad.employment_status && bad.tax_residency && bad.dependants);
  assert.ok(pd.validateProfileDetails({ dependants: -1 }, NOW).errors.dependants);
  assert.ok(pd.validateProfileDetails({ dependants: 21 }, NOW).errors.dependants);
});

console.log('\ndb/profiles mapping');
test('patch stores details in onboarding_data and drops invalid ones', () => {
  const { cols, onboarding_data } = profilePatchToColumns({ legal_name: 'Mahmoud Abumarzouq', tax_residency: 'bogus', annual_income: '90000' });
  assert.deepStrictEqual(onboarding_data, { legal_name: 'Mahmoud Abumarzouq' });
  assert.strictEqual(cols.annual_income, 90000);
});
test('normalizeProfile exposes details, email, phone and DOB-derived age', () => {
  const dob = `${new Date().getUTCFullYear() - 40}-01-01`;
  const p = normalizeProfile(
    { annual_income: '90000', onboarding_data: { age_band: 'under-30', date_of_birth: dob, dependants: 1, address: { line1: '1 George St', suburb: 'Sydney', state: 'NSW', postcode: '2000' } } },
    { email: 'mahmoud@example.com', phone: '+61412345678', name: 'Mahmoud' }
  );
  assert.strictEqual(p.age, 40, 'DOB beats the age band');
  assert.strictEqual(p.email, 'mahmoud@example.com');
  assert.strictEqual(p.phone, '+61412345678');
  assert.strictEqual(p.dependants, 1);
  assert.strictEqual(p.address.state, 'NSW');
  assert.strictEqual(p.legal_name, null);
  const banded = normalizeProfile({ onboarding_data: { age_band: '40-49' } }, null);
  assert.strictEqual(banded.age, 45, 'falls back to the age band without a DOB');
});

console.log('\nphone helpers');
test('normalisePhone: AU mobiles only, E.164 out', () => {
  assert.strictEqual(pd.normalisePhone('AU', '0412 345 678'), '+61412345678');
  assert.strictEqual(pd.normalisePhone('AU', '412345678'), '+61412345678');
  assert.strictEqual(pd.normalisePhone('AU', '+61 412 345 678'), '+61412345678');
  assert.strictEqual(pd.normalisePhone('AU', '(02) 9876 5432'), null, 'landline');
  assert.strictEqual(pd.normalisePhone('AU', '+64 21 123 4567'), null, 'other country code');
  assert.strictEqual(pd.normalisePhone('NZ', '021 123 4567'), '+64211234567');
  assert.strictEqual(pd.normalisePhone('XX', '0412345678'), null);
  assert.strictEqual(pd.normalisePhone('AU', 'abc'), null);
});
test('formatPhone groups AU mobiles', () => {
  assert.strictEqual(pd.formatPhone('+61412345678'), '+61 412 345 678');
  assert.strictEqual(pd.formatPhone('+64211234567'), '+64211234567');
});
test('challenge: code never stored, resend cooldown, expiry, attempts', () => {
  const t0 = 1_000_000;
  const s = pd.createPhoneChallenge('+61412345678', '123456', t0);
  assert.ok(!Object.values(s).includes('123456'), 'plain code must not be stored');
  assert.strictEqual(pd.resendWaitSeconds(s, t0 + 1000), 29);
  assert.strictEqual(pd.resendWaitSeconds(s, t0 + 31000), 0);
  assert.strictEqual(pd.checkPhoneCode(s, '12345', t0).reason, 'format');
  assert.strictEqual(pd.checkPhoneCode(s, '654321', t0).reason, 'mismatch');
  assert.deepStrictEqual(pd.checkPhoneCode(s, '123 456', t0), { ok: true, phone: '+61412345678' });
  assert.strictEqual(pd.checkPhoneCode(s, '123456', t0 + pd.PHONE_CODE_TTL_MS + 1).reason, 'expired');
  const locked = pd.createPhoneChallenge('+61412345678', '123456', t0);
  for (let i = 0; i < pd.PHONE_MAX_ATTEMPTS; i++) pd.checkPhoneCode(locked, '000000', t0);
  assert.strictEqual(pd.checkPhoneCode(locked, '123456', t0).reason, 'locked', 'right code after lockout still fails');
  assert.strictEqual(pd.checkPhoneCode(null, '123456', t0).reason, 'none');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
