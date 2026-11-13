'use strict';
// lib/welcome.js — answers collected by the /welcome onboarding flow
// (specs/onboarding-v2-membership.md, PR 4). Stored in
// user_profiles.onboarding_data via the profile PATCH, sanitised here so only
// known values are ever saved. Shared with the client (same ids/labels).

const GOALS = Object.freeze([
  { id: 'understand', label: 'Understand my money' },
  { id: 'debt', label: 'Pay down debt' },
  { id: 'super', label: 'Grow my super' },
  { id: 'invest', label: 'Invest the profit-based way' },
  { id: 'ask', label: 'Ask Maal anything' },
  { id: 'unsure', label: 'Not sure yet' },
]);

const HEARD_FROM = Object.freeze([
  { id: 'reddit', label: 'Reddit' },
  { id: 'friends', label: 'Friends & family' },
  { id: 'google', label: 'Google' },
  { id: 'x', label: 'X' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'streaming_tv', label: 'Streaming TV' },
  { id: 'instagram_facebook', label: 'Instagram/Facebook' },
  { id: 'event', label: 'Event' },
  { id: 'other', label: 'Other' },
]);

const GOAL_IDS = new Set(GOALS.map((g) => g.id));
const HEARD_IDS = new Set(HEARD_FROM.map((h) => h.id));

// Known goal ids only, de-duplicated, in the canonical order.
function sanitizeGoals(raw) {
  const picked = new Set((Array.isArray(raw) ? raw : []).map((g) => String(g)));
  return GOALS.map((g) => g.id).filter((id) => picked.has(id) && GOAL_IDS.has(id));
}

function sanitizeHeardFrom(raw) {
  const v = String(raw == null ? '' : raw);
  return HEARD_IDS.has(v) ? v : null;
}

module.exports = { GOALS, HEARD_FROM, sanitizeGoals, sanitizeHeardFrom };
