'use strict';
const { offerLine } = require('./membership');
// lib/plan-limits.js
// Per-feature usage limits by plan (specs/silvia-parity-tier1-2.md, decision 10).
// COUNT-based (not tokens), reset on the 1st of each month.
//
// Free tier = 0 AI usage BY DESIGN (launch cost guardrail) — free users see
// every UI but AI actions return an upgrade prompt, never an error. Raising
// free allowances later is a one-line change in PLAN_LIMITS.
//
// Testing override: FREE_ADVISOR_MESSAGES (env, default 0) gives Free users a
// monthly Ask Maal allowance without a code change, so the chat can be opened
// to testers and closed again just by editing the env var. It only affects
// advisor_messages (web chat + SMS share it); Research, Radar and AI files stay
// Pro-only. Read at call time, capped at FREE_ADVISOR_MESSAGES_MAX.
//
// `active_radars` is a CONCURRENT limit (how many can be active at once),
// not a monthly counter — it is checked against a live count, not
// usage_counters.

// `member` is the only plan for sale (lib/membership.js: $4.99 first year, then
// $49.99/yr) and also applies during the 14-day trial. Its 100 Ask Maal
// messages/month is a HARD stop that is deliberately never advertised: copy
// says "access to AI chat", and the limit message never states the number.
// `pro`/`max` are legacy — no longer sold, kept for anyone already on them.
const PLAN_LIMITS = {
  free:   { advisor_messages: 0,    research_runs: 0,  active_radars: 0,  ai_files: 0 },
  member: { advisor_messages: 100,  research_runs: 10, active_radars: 10, ai_files: 10 },
  pro:    { advisor_messages: 500,  research_runs: 10, active_radars: 10, ai_files: 10 },
  max:  { advisor_messages: 1000, research_runs: 50, active_radars: 50, ai_files: 100 }, // 1000 = Max soft cap
};

const MONTHLY_FEATURES = ['advisor_messages', 'research_runs', 'ai_files'];
const CONCURRENT_FEATURES = ['active_radars'];

function normalizePlan(plan) {
  const p = String(plan || '').toLowerCase();
  return PLAN_LIMITS[p] ? p : 'free';
}

// 'YYYY-MM' period key. Usage resets on the 1st of each month because a new
// month simply has no counter row yet — there is no reset job.
//
// Pinned to Australia/Sydney, not the host's local time: Maal is an Australian
// product, so quotas must roll over at Australian midnight rather than at
// whatever timezone the server happens to run in (Render is UTC, which would
// reset an AU user's quota mid-morning on the 1st, or late on the last day of
// the previous month during daylight saving).
const BILLING_TZ = 'Australia/Sydney';

function periodKey(date) {
  const d = date ? new Date(date) : new Date();
  // en-CA gives YYYY-MM-DD, so slicing to 7 chars yields the YYYY-MM key.
  return d.toLocaleDateString('en-CA', { timeZone: BILLING_TZ }).slice(0, 7);
}

const FREE_ADVISOR_MESSAGES_MAX = 1000;

// Free-tier Ask Maal allowance from env. Anything missing, non-numeric or
// negative means 0 (the launch guardrail); fractions round down.
function freeAdvisorMessages() {
  const n = Math.floor(Number(process.env.FREE_ADVISOR_MESSAGES));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, FREE_ADVISOR_MESSAGES_MAX);
}

function limitFor(plan, feature) {
  const p = normalizePlan(plan);
  if (p === 'free' && feature === 'advisor_messages') return freeAdvisorMessages();
  const limits = PLAN_LIMITS[p];
  return Object.prototype.hasOwnProperty.call(limits, feature) ? limits[feature] : 0;
}

// Can this plan use `feature` given `used` so far this period (or currently
// active, for concurrent features)? → { allowed, plan, limit, used, remaining }
function evaluate(plan, feature, used) {
  const p = normalizePlan(plan);
  const limit = limitFor(p, feature);
  const u = Math.max(0, Number(used) || 0);
  return {
    allowed: u < limit,
    plan: p,
    feature,
    limit,
    used: u,
    remaining: Math.max(0, limit - u),
  };
}

// User-facing upgrade copy per feature (shown in place of an error).
function upgradeMessage(plan, feature) {
  const p = normalizePlan(plan);
  const names = {
    advisor_messages: 'Ask Maal messages',
    research_runs: 'research reports',
    active_radars: 'active radars',
    ai_files: 'AI-generated files',
  };
  const name = names[feature] || 'this feature';
  const join = 'Join Maal in Plan & Usage: ' + offerLine();
  if (p === 'free' && feature === 'advisor_messages' && limitFor(p, feature) > 0) {
    return 'You’ve used your free Ask Maal messages for this month. ' + join;
  }
  if (p === 'free') {
    return 'Your free trial has ended, so ' + name + ' are paused. ' + join;
  }
  // Members: never state the number (the chat cap is unadvertised).
  if (p === 'member') {
    if (CONCURRENT_FEATURES.includes(feature)) {
      return 'You’ve reached your active radar limit. Pause or delete a radar to add another.';
    }
    if (feature === 'advisor_messages') {
      return 'You’ve reached this month’s Ask Maal limit. It resets on the 1st.';
    }
    return 'You’ve used this month’s ' + name + '. Your usage resets on the 1st.';
  }
  const planName = p === 'pro' ? 'Pro' : 'Max';
  const upsell = ''; // legacy plans: nothing higher is sold any more
  // active_radars is a concurrent limit, not a monthly quota — don't mention a reset.
  if (CONCURRENT_FEATURES.includes(feature)) {
    return 'You’ve reached the ' + limitFor(p, feature) + '-radar limit on the ' + planName + ' plan. Pause or delete a radar to add another.' + upsell;
  }
  return 'You’ve used all your ' + name + ' for this month on the ' + planName + ' plan. Your usage resets on the 1st.' + upsell;
}

module.exports = { PLAN_LIMITS, FREE_ADVISOR_MESSAGES_MAX, MONTHLY_FEATURES, CONCURRENT_FEATURES, normalizePlan, periodKey, limitFor, evaluate, upgradeMessage };
