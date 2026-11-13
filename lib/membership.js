'use strict';
// lib/membership.js — the single paid plan + the 14-day free trial.
// Spec: specs/onboarding-v2-membership.md (decided 2026-11-15).
//
// One plan for sale: Maal Membership, $4.99 for the first year, then $49.99 a
// year (AUD). The old Pro ($20/mo) and Max ($200/mo) plans are no longer sold;
// anyone already on them keeps their plan ("grandfathered").
//
// Everyone gets a 14-day trial with full member access and no card. After it
// ends, an account without a paid plan is "free": the dashboard shows the
// paywall and AI features return an upgrade prompt.
//
// PURE — no DB, no Stripe. Amounts are integer CENTS. Covered by
// test/membership.test.js.

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_DAYS = 14;

const MEMBERSHIP = Object.freeze({
  key: 'member',
  name: 'Maal Membership',
  currency: 'aud',
  interval: 'year',
  yearCents: 4999,        // $49.99 every year after the first
  firstYearCents: 499,    // $4.99 for the first year
});

// The first-year price is the yearly price minus a one-time discount, which is
// how Stripe expresses it (a coupon with duration "once").
const FIRST_YEAR_DISCOUNT_CENTS = MEMBERSHIP.yearCents - MEMBERSHIP.firstYearCents; // 4500

// Plans that grant full access on their own. pro/max are legacy (not sold).
const PAID_PLANS = Object.freeze(['member', 'pro', 'max']);

function isPaidPlan(plan) {
  return PAID_PLANS.includes(String(plan || '').toLowerCase());
}

function trialEndsAt(startedAt) {
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + TRIAL_DAYS * DAY_MS);
}

// trial = { started_at, ends_at } row (or null). Returns where it stands now.
// daysLeft rounds UP, so a trial with 3 hours left shows "1 day left".
function trialStatus(trial, now) {
  if (!trial) return { active: false, endsAt: null, daysLeft: 0 };
  const ends = trial.ends_at ? new Date(trial.ends_at) : trialEndsAt(trial.started_at);
  if (!ends || Number.isNaN(ends.getTime())) return { active: false, endsAt: null, daysLeft: 0 };
  const t = now ? new Date(now).getTime() : Date.now();
  const msLeft = ends.getTime() - t;
  return {
    active: msLeft > 0,
    endsAt: ends,
    daysLeft: msLeft > 0 ? Math.ceil(msLeft / DAY_MS) : 0,
  };
}

// The plan whose limits apply right now:
//   paid plan        → that plan (member / legacy pro / legacy max)
//   trial still live → 'member' (full access during the trial)
//   otherwise        → 'free' (paywall)
function effectivePlan(basePlan, trial, now) {
  const base = String(basePlan || '').toLowerCase();
  if (isPaidPlan(base)) return base;
  return trialStatus(trial, now).active ? MEMBERSHIP.key : 'free';
}

// Everything the app needs to know about a user's access, in one shape.
function accessFor(basePlan, trial, now) {
  const status = trialStatus(trial, now);
  const plan = effectivePlan(basePlan, trial, now);
  const paid = isPaidPlan(basePlan);
  return {
    plan,                          // limits key for lib/plan-limits.js
    basePlan: String(basePlan || 'free').toLowerCase(),
    paid,
    trial: paid ? null : { active: status.active, endsAt: status.endsAt, daysLeft: status.daysLeft },
    paywalled: !paid && !status.active,
  };
}

function formatAud(cents) {
  return '$' + (cents / 100).toFixed(2);
}

// The one offer line used everywhere the price appears. Australian Consumer
// Law: the renewal price must sit next to the introductory price.
function offerLine() {
  return `${formatAud(MEMBERSHIP.firstYearCents)} for your first year, then ${formatAud(MEMBERSHIP.yearCents)}/year. Cancel anytime.`;
}

module.exports = {
  DAY_MS,
  TRIAL_DAYS,
  MEMBERSHIP,
  FIRST_YEAR_DISCOUNT_CENTS,
  PAID_PLANS,
  isPaidPlan,
  trialEndsAt,
  trialStatus,
  effectivePlan,
  accessFor,
  formatAud,
  offerLine,
};
