'use strict';
// lib/referrals.js — pure rules for "Refer 3 friends, renew for $4.99".
// Spec: specs/onboarding-v2-membership.md (PR 2).
//
// - Every member has a personal code; their link is /r/<code>.
// - While signups are invite-only, a referral link counts as an invite, but
//   each code can let in at most MAX_INVITE_SIGNUPS people, so a link posted
//   publicly can't empty the waitlist.
// - When 3 people a member referred become PAYING members, the member earns a
//   reward: their next yearly renewal is $4.99 instead of $49.99. Every further
//   3 paid referrals earns another reward, one at a time (a new reward is only
//   granted once the previous one has been used on a renewal).
//
// PURE — no DB, no Stripe. Covered by test/referrals.test.js.

const crypto = require('crypto');
const { canonicalEmail } = require('./waitlist-gate');
const membership = require('./membership');

const REQUIRED_PAID = 3;
const MAX_INVITE_SIGNUPS = 20;
const CODE_LENGTH = 8;
// No 0/O/1/I/L so codes are easy to read aloud or type.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// The renewal reward, expressed like the first-year offer: a one-time amount
// off the next yearly invoice so it comes to the first-year price.
const RENEWAL_DISCOUNT_CENTS = membership.MEMBERSHIP.yearCents - membership.MEMBERSHIP.firstYearCents; // 4500

function generateCode(randomBytes) {
  const bytes = randomBytes || crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// Accepts what a person might paste (any case, stray spaces/dashes).
function normaliseCode(raw) {
  const s = String(raw == null ? '' : raw).toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!ALPHABET.includes(ch)) return null;
  return s;
}

// Can this code let someone past the waitlist right now?
function inviteAllowed(codeRow, signupsSoFar) {
  if (!codeRow) return false;
  return Number(signupsSoFar || 0) < MAX_INVITE_SIGNUPS;
}

// Nobody earns a reward for referring themselves (same address in any form).
function isSelfReferral(referrerEmail, newEmail) {
  const a = canonicalEmail(referrerEmail);
  const b = canonicalEmail(newEmail);
  return !!a && a === b;
}

// Should a new reward be granted now?
//   paidCount     — referred users who became paying members (not refunded)
//   rewardsSoFar  — rewards ever granted to this referrer
//   hasOpenReward — a granted reward not yet used on a renewal
function shouldGrantReward(paidCount, rewardsSoFar, hasOpenReward) {
  if (hasOpenReward) return false;
  return Math.floor(Number(paidCount || 0) / REQUIRED_PAID) > Number(rewardsSoFar || 0);
}

// "2 of 3 friends joined" for the current reward cycle.
function progress(paidCount, rewardsSoFar) {
  const paid = Math.max(0, Number(paidCount || 0));
  const used = Math.max(0, Number(rewardsSoFar || 0)) * REQUIRED_PAID;
  const towardsNext = Math.min(REQUIRED_PAID, Math.max(0, paid - used));
  return { paid, towardsNext, needed: REQUIRED_PAID };
}

module.exports = {
  REQUIRED_PAID,
  MAX_INVITE_SIGNUPS,
  CODE_LENGTH,
  ALPHABET,
  RENEWAL_DISCOUNT_CENTS,
  generateCode,
  normaliseCode,
  inviteAllowed,
  isSelfReferral,
  shouldGrantReward,
  progress,
};
