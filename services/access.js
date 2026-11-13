'use strict';
// services/access.js — "what can this user do right now?"
//
// Joins the user's stored plan (users.plan) with their 14-day trial
// (user_trials) using the pure rules in lib/membership.js. Every usage gate
// (routes/api.js, services/sms.js) and the Plan & Usage endpoint ask here, so
// trial users get member limits and expired trials hit the paywall.

const membership = require('../lib/membership');
const trialsDb = require('../db/trials');

// user = row from db/users (needs id + plan). Never throws: if the trial
// lookup fails we fall back to the stored plan alone (a paid user is
// unaffected; an unpaid user is treated as trialing so an outage never locks
// a new user out of the app they just joined). The failure is logged.
async function forUser(user, now) {
  if (!user) return membership.accessFor('free', null, now);
  if (membership.isPaidPlan(user.plan)) return membership.accessFor(user.plan, null, now);
  let trial = null;
  try {
    trial = await trialsDb.getOrStartTrial(user.id);
  } catch (e) {
    console.error('[access] trial lookup failed, failing open:', e.message);
    return membership.accessFor(user.plan, { ends_at: new Date(Date.now() + membership.DAY_MS) }, now);
  }
  return membership.accessFor(user.plan, trial, now);
}

module.exports = { forUser };
