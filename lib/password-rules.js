'use strict';
// lib/password-rules.js — the password rules for new accounts.
// PURE. Used by routes/auth.js (POST /signup) and mirrored, rule for rule, by
// the live checklist in views/auth-signup.ejs (Figma onboarding frames 05–07).
// Covered by test/password-rules.test.js.

const MIN_LENGTH = 8;
const MAX_LENGTH = 64;

// Order matches the checklist on the sign-up page.
const RULES = Object.freeze([
  { id: 'upper', label: '1 uppercase letter', test: (v) => /[A-Z]/.test(v), error: 'Password must contain at least one uppercase letter.' },
  { id: 'lower', label: '1 lowercase letter', test: (v) => /[a-z]/.test(v), error: 'Password must contain at least one lowercase letter.' },
  { id: 'num', label: '1 number', test: (v) => /[0-9]/.test(v), error: 'Password must contain at least one number.' },
  { id: 'len', label: `${MIN_LENGTH} to ${MAX_LENGTH} characters`, test: (v) => v.length >= MIN_LENGTH && v.length <= MAX_LENGTH, error: `Password must be ${MIN_LENGTH} to ${MAX_LENGTH} characters.` },
  { id: 'special', label: '1 special character', test: (v) => /[^A-Za-z0-9]/.test(v), error: 'Password must contain at least one special character (for example ! or #).' },
]);

// Map of rule id → passed, for a password (non-strings count as empty).
function checkPassword(password) {
  const v = typeof password === 'string' ? password : '';
  const out = {};
  for (const r of RULES) out[r.id] = r.test(v);
  return out;
}

// First failing rule's message, or null when every rule passes. Length is
// reported first so a short password gets the most useful hint.
function passwordStrengthError(password) {
  const v = typeof password === 'string' ? password : '';
  const ordered = [RULES.find((r) => r.id === 'len'), ...RULES.filter((r) => r.id !== 'len')];
  for (const r of ordered) if (!r.test(v)) return r.error;
  return null;
}

module.exports = { MIN_LENGTH, MAX_LENGTH, RULES, checkPassword, passwordStrengthError };
