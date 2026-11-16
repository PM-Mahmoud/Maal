'use strict';
// lib/profile-details.js
// Pure validation + mapping for the Settings → Profile form (redesign S5).
//
// These are the personal details the old onboarding never captured: legal name,
// date of birth, an Australian postal address, employment status, tax residency
// and dependants. They live in user_profiles.onboarding_data (existing JSONB) —
// no schema change. The phone number lives on users.phone and only changes
// through the SMS-verified flow (see phone helpers below).
//
// Everything here is deterministic (the clock is injected) and covered by
// test/profile-details.test.js.

const crypto = require('crypto');

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

const EMPLOYMENT_STATUSES = [
  'full_time', 'part_time', 'casual', 'self_employed', 'contractor',
  'unemployed', 'retired', 'student', 'home_duties',
];

const TAX_RESIDENCIES = ['resident', 'foreign_resident', 'working_holiday_maker'];

const MAX_DEPENDANTS = 20;
const MIN_AGE = 16;
const MAX_AGE = 120;

const DETAIL_KEYS = ['legal_name', 'date_of_birth', 'address', 'employment_status', 'tax_residency', 'dependants'];

function cleanText(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Whole years between an ISO date (YYYY-MM-DD) and `now`, or null if invalid. */
function ageFromDob(dob, now = new Date()) {
  if (typeof dob !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const [y, m, d] = dob.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Reject rollovers such as 2001-02-30.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  let age = now.getUTCFullYear() - y;
  const beforeBirthday = now.getUTCMonth() < m - 1 || (now.getUTCMonth() === m - 1 && now.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Validate the profile-detail keys present in a PATCH body.
 * Returns { details, errors }: `details` holds only the keys that were present
 * (sanitised, ready for onboarding_data); `errors` maps field → message.
 * An explicit empty value clears the field (stored as null).
 */
function validateProfileDetails(input, now = new Date()) {
  const p = input || {};
  const details = {};
  const errors = {};

  if ('legal_name' in p) {
    const v = cleanText(p.legal_name, 120);
    details.legal_name = v || null;
  }

  if ('date_of_birth' in p) {
    const raw = cleanText(p.date_of_birth, 10);
    if (!raw) details.date_of_birth = null;
    else {
      const age = ageFromDob(raw, now);
      if (age === null) errors.date_of_birth = 'Enter a valid date of birth.';
      else if (age < MIN_AGE) errors.date_of_birth = `You need to be at least ${MIN_AGE} to use Maal.`;
      else if (age > MAX_AGE) errors.date_of_birth = 'Check the year of your date of birth.';
      else details.date_of_birth = raw;
    }
  }

  if ('address' in p) {
    const a = p.address;
    if (a == null || (typeof a === 'object' && !Object.values(a).some((v) => cleanText(v, 200)))) {
      details.address = null;
    } else if (typeof a !== 'object' || Array.isArray(a)) {
      errors.address = 'Enter a valid address.';
    } else {
      const line1 = cleanText(a.line1, 120);
      const suburb = cleanText(a.suburb, 60);
      const state = cleanText(a.state, 3).toUpperCase();
      const postcode = cleanText(a.postcode, 10);
      if (!line1) errors.address = 'Enter your street address.';
      else if (!suburb) errors.address = 'Enter your suburb.';
      else if (!AU_STATES.includes(state)) errors.address = 'Choose a state or territory.';
      else if (!/^\d{4}$/.test(postcode)) errors.address = 'Postcodes have 4 digits.';
      else details.address = { line1, suburb, state, postcode };
    }
  }

  if ('employment_status' in p) {
    const v = cleanText(p.employment_status, 40);
    if (!v) details.employment_status = null;
    else if (!EMPLOYMENT_STATUSES.includes(v)) errors.employment_status = 'Choose an employment status.';
    else details.employment_status = v;
  }

  if ('tax_residency' in p) {
    const v = cleanText(p.tax_residency, 40);
    if (!v) details.tax_residency = null;
    else if (!TAX_RESIDENCIES.includes(v)) errors.tax_residency = 'Choose a tax residency status.';
    else details.tax_residency = v;
  }

  if ('dependants' in p) {
    const raw = p.dependants;
    if (raw === '' || raw == null) details.dependants = null;
    else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > MAX_DEPENDANTS) errors.dependants = `Enter a whole number from 0 to ${MAX_DEPENDANTS}.`;
      else details.dependants = n;
    }
  }

  return { details, errors };
}

/** The detail fields as the React profile exposes them (nulls when unset). */
function detailsFromOnboardingData(od) {
  const o = od && typeof od === 'object' ? od : {};
  const a = o.address && typeof o.address === 'object' ? o.address : null;
  return {
    legal_name: o.legal_name || null,
    date_of_birth: o.date_of_birth || null,
    address: a ? { line1: a.line1 || '', suburb: a.suburb || '', state: a.state || '', postcode: a.postcode || '' } : null,
    employment_status: o.employment_status || null,
    tax_residency: o.tax_residency || null,
    dependants: Number.isInteger(o.dependants) ? o.dependants : null,
  };
}

// ─── Phone (SMS-verified) ────────────────────────────────────────────────────

const PHONE_COUNTRIES = { AU: '+61', NZ: '+64', GB: '+44', US: '+1' };
const PHONE_CODE_TTL_MS = 10 * 60 * 1000;
const PHONE_RESEND_MS = 30 * 1000;
const PHONE_MAX_ATTEMPTS = 5;

/**
 * Normalise a country + local number to E.164, or null when invalid.
 * AU numbers must be mobiles (04xx xxx xxx / 4xx xxx xxx) — SMS can't reach landlines.
 */
function normalisePhone(country, number) {
  const prefix = PHONE_COUNTRIES[String(country || '').toUpperCase()];
  if (!prefix) return null;
  let digits = String(number || '').replace(/[\s()-]/g, '');
  if (digits.startsWith(prefix)) digits = digits.slice(prefix.length);
  else if (digits.startsWith('+')) return null; // a different country code
  if (!/^\d+$/.test(digits)) return null;
  if (prefix === '+61') {
    if (digits.startsWith('0')) digits = digits.slice(1);
    return /^4\d{8}$/.test(digits) ? `+61${digits}` : null;
  }
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.length >= 6 && digits.length <= 12 ? `${prefix}${digits}` : null;
}

/** "+61412345678" → "+61 412 345 678" (AU mobiles); others are returned as-is. */
function formatPhone(e164) {
  const m = /^\+61(4\d{2})(\d{3})(\d{3})$/.exec(String(e164 || ''));
  return m ? `+61 ${m[1]} ${m[2]} ${m[3]}` : String(e164 || '');
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

/** New pending-verification state for the session (the code itself is never stored). */
function createPhoneChallenge(phone, code, now = Date.now()) {
  return { phone, hash: hashCode(code), expiresAt: now + PHONE_CODE_TTL_MS, sentAt: now, attempts: 0 };
}

/** Seconds until another code may be sent (0 = now). */
function resendWaitSeconds(state, now = Date.now()) {
  if (!state || !state.sentAt) return 0;
  return Math.max(0, Math.ceil((state.sentAt + PHONE_RESEND_MS - now) / 1000));
}

/**
 * Check a submitted code against the session challenge. Mutates state.attempts.
 * Returns { ok: true, phone } or { ok: false, reason, error }.
 */
function checkPhoneCode(state, code, now = Date.now()) {
  if (!state || !state.hash) return { ok: false, reason: 'none', error: 'Request a new code first.' };
  if (now > state.expiresAt) return { ok: false, reason: 'expired', error: 'That code has expired. Request a new one.' };
  if (state.attempts >= PHONE_MAX_ATTEMPTS) return { ok: false, reason: 'locked', error: 'Too many attempts. Request a new code.' };
  state.attempts += 1;
  const submitted = String(code || '').replace(/\D/g, '');
  if (submitted.length !== 6) return { ok: false, reason: 'format', error: 'Enter the 6-digit code.' };
  const a = Buffer.from(hashCode(submitted), 'hex');
  const b = Buffer.from(state.hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'mismatch', error: "That code doesn't match. Check it and try again." };
  }
  return { ok: true, phone: state.phone };
}

module.exports = {
  AU_STATES, EMPLOYMENT_STATUSES, TAX_RESIDENCIES, DETAIL_KEYS, MAX_DEPENDANTS,
  PHONE_COUNTRIES, PHONE_CODE_TTL_MS, PHONE_RESEND_MS, PHONE_MAX_ATTEMPTS,
  ageFromDob, validateProfileDetails, detailsFromOnboardingData,
  normalisePhone, formatPhone, createPhoneChallenge, resendWaitSeconds, checkPhoneCode,
};
