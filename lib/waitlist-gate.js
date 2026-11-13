'use strict';
// lib/waitlist-gate.js — pure rules for the invite-only launch.
//
// While the gate is on, a NEW account can only be created for an email that
// is on the waitlist with status 'invited' (or already 'joined'). Existing
// users are never affected: login doesn't go through this check.
//
// WAITLIST_GATE env: on by default; set WAITLIST_GATE=off to open signups.

const validator = require('validator');

const STATUSES = ['pending', 'invited', 'joined'];
const DEFAULT_SOURCE = 'website';

function isGateOn(env) {
  const v = String((env || process.env).WAITLIST_GATE || '').trim().toLowerCase();
  return !['off', 'false', '0', 'no'].includes(v);
}

// entry = waitlist row (or null). Only invited/joined emails may create accounts.
function canCreateAccount(entry, env) {
  if (!isGateOn(env)) return true;
  return !!(entry && (entry.status === 'invited' || entry.status === 'joined'));
}

// Free-text source tags (e.g. ?src=expo-nov26) are reduced to a short
// lowercase slug so they're safe to store, filter and show in admin.
function normaliseSource(raw) {
  const s = String(raw == null ? '' : raw).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || DEFAULT_SOURCE;
}

function normaliseStatus(raw) {
  const s = String(raw || '').toLowerCase();
  return STATUSES.includes(s) ? s : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normaliseEmail(raw) {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  return e.length <= 255 && EMAIL_RE.test(e) ? e : null;
}

// Signup routes run express-validator's normalizeEmail(), which rewrites some
// addresses (Gmail drops dots and +tags, googlemail → gmail, Outlook/Yahoo/
// iCloud drop +tags). The waitlist stores what the person typed, so both sides
// are compared in this canonical form or an invited Gmail user gets locked out.
function canonicalEmail(raw) {
  const e = normaliseEmail(raw);
  if (!e) return null;
  return validator.normalizeEmail(e) || e;
}

// Domains a canonical address could have been typed under.
function candidateDomains(canonical) {
  const domain = String(canonical || '').split('@')[1] || '';
  if (!domain) return [];
  return domain === 'gmail.com' ? ['gmail.com', 'googlemail.com'] : [domain];
}

// Pick the waitlist row matching `email` (any form) from candidate rows.
function matchEntry(rows, email) {
  const want = canonicalEmail(email);
  if (!want) return null;
  return (rows || []).find((r) => canonicalEmail(r.email) === want) || null;
}

// Consent arrives from JSON (true) or a form ('on' / 'true' / '1').
function parseConsent(raw) {
  return raw === true || ['on', 'true', '1', 'yes'].includes(String(raw).toLowerCase());
}

// CSV cell escaping, with formula-injection guard for spreadsheet apps.
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(rows) {
  const cols = ['email', 'name', 'status', 'source', 'consent_contact', 'score', 'created_at', 'invited_at', 'joined_at'];
  const lines = [cols.join(',')];
  for (const r of rows) {
    lines.push(cols.map((c) => {
      const v = r[c];
      return csvCell(v instanceof Date ? v.toISOString() : v);
    }).join(','));
  }
  return lines.join('\n') + '\n';
}

module.exports = { STATUSES, DEFAULT_SOURCE, isGateOn, canCreateAccount, normaliseSource, normaliseStatus, normaliseEmail, canonicalEmail, candidateDomains, matchEntry, parseConsent, csvCell, toCsv };
