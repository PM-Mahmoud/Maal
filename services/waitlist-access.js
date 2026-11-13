'use strict';
// services/waitlist-access.js — the one place every account-creation path asks
// "may this email sign up right now?" (routes/auth.js password + email-code,
// routes/oauth.js Google, routes/api.js JSON signup). Rules live in
// lib/waitlist-gate.js; this just joins them to the waitlist table.

const gate = require('../lib/waitlist-gate');
const waitlistDb = require('../db/waitlist');

const NOT_INVITED_MESSAGE =
  'Maal is invite-only for now, and this email hasn’t been invited yet. Join the waitlist and we’ll email you when your spot opens.';

// Matches across address forms (e.g. Gmail dots), see lib/waitlist-gate.js.
async function findEntry(email) {
  const canonical = gate.canonicalEmail(email);
  if (!canonical) return null;
  const rows = await waitlistDb.listByDomains(gate.candidateDomains(canonical));
  return gate.matchEntry(rows, canonical);
}

async function canSignUp(email) {
  if (!gate.isGateOn()) return true;
  return gate.canCreateAccount(await findEntry(email));
}

// Best-effort: flip the waitlist row to 'joined' once the account exists.
async function recordJoined(email) {
  try {
    const entry = await findEntry(email);
    if (entry) await waitlistDb.markJoinedById(entry.id);
  } catch (e) {
    console.error('[waitlist] markJoined failed:', e.message);
  }
}

module.exports = { canSignUp, recordJoined, NOT_INVITED_MESSAGE };
