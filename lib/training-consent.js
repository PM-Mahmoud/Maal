'use strict';
// lib/training-consent.js — model-training consent rules (Tier 3 PR 1, spec D4).
//
// PURE: no DB, no clock unless passed in. The append-only `training_consents`
// log is the only source of truth; these functions decide what it means.
//
// Rules (consumer-data consent design):
//   - Two scopes: 'general' (chats, uploads, manually entered data, usage
//     signals) and 'cdr' (anything derived from Consumer Data Right).
//   - No consent row = NOT eligible. Data collected before a user was shown the
//     disclosure can never be used, so "default on" only exists once a row does.
//   - A data row is eligible only if consent was granted when it was created
//     AND is still granted now (opting out removes the user from future builds).
//   - CDR data needs its own 'cdr' grant; nothing in the app can create one
//     until the lawyer-approved bank-connection consent wording ships.
//   - Google-sourced data is never eligible.

const POLICY_VERSION = '2026-10-21';
const SCOPES = Object.freeze(['general', 'cdr']);
const SOURCES = Object.freeze(['signup', 'signup_google', 'notice', 'settings']);

// Data source → consent scope. null = never eligible, whatever the consent.
const SOURCE_SCOPES = Object.freeze({
  chat: 'general',
  upload: 'general',
  manual: 'general',
  usage: 'general',
  bank_connection: 'cdr',
  google: null,
});

function toTime(v) {
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : NaN;
}

// The consent row in effect for `scope` at instant `at` (latest row created at
// or before `at`), or null when none existed yet.
function stateAt(rows, scope, at) {
  const atT = toTime(at);
  if (!Number.isFinite(atT)) return null;
  let best = null;
  for (const r of rows || []) {
    if (!r || r.scope !== scope) continue;
    const t = toTime(r.created_at);
    if (!Number.isFinite(t) || t > atT) continue;
    if (!best || t >= toTime(best.created_at)) best = r;
  }
  return best;
}

function currentState(rows, scope, now = new Date()) {
  return stateAt(rows, scope, now);
}

function isEligible(rows, scope, dataCreatedAt, now = new Date()) {
  if (!SCOPES.includes(scope)) return false;
  const atCreation = stateAt(rows, scope, dataCreatedAt);
  const current = currentState(rows, scope, now);
  return !!(
    atCreation?.granted === true && atCreation.policy_version === POLICY_VERSION
      && current?.granted === true && current.policy_version === POLICY_VERSION
  );
}

function isEligibleForSource(rows, source, dataCreatedAt, now = new Date(), provenance) {
  const scope = Object.prototype.hasOwnProperty.call(SOURCE_SCOPES, source) ? SOURCE_SCOPES[source] : null;
  if (!scope) return false;
  // Chats and uploads can include CDR-derived content. A processor must
  // establish provenance before considering any of those records eligible.
  if (source === 'chat' || source === 'upload') {
    return isEligible(rows, provenance, dataCreatedAt, now);
  }
  return isEligible(rows, scope, dataCreatedAt, now);
}

// What the Settings › Privacy page and the one-time notice need.
// needsNotice: the user has never been shown this policy version.
function summarize(rows, now = new Date()) {
  const general = currentState(rows, 'general', now);
  const cdr = currentState(rows, 'cdr', now);
  return {
    policyVersion: POLICY_VERSION,
    general: {
      granted: general?.granted === true && general.policy_version === POLICY_VERSION,
      updatedAt: general ? new Date(general.created_at).toISOString() : null,
      needsNotice: !general || general.policy_version !== POLICY_VERSION,
    },
    cdr: { granted: cdr?.granted === true && cdr.policy_version === POLICY_VERSION },
  };
}

module.exports = {
  POLICY_VERSION,
  SCOPES,
  SOURCES,
  SOURCE_SCOPES,
  stateAt,
  currentState,
  isEligible,
  isEligibleForSource,
  summarize,
};
