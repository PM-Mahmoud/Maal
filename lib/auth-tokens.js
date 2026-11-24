'use strict';
// lib/auth-tokens.js — PURE helpers for the sign-in / reset-password flows.
// Covered by test/auth-tokens.test.js.
//
// Password-reset tokens: the email carries a random 256-bit token; the
// database only ever stores its SHA-256 hash (users.reset_token). A leaked DB
// row or log line therefore can't be replayed as a reset link, and because the
// lookup is by hash, comparing the secret is never a timing side channel.

const crypto = require('crypto');

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_RE = /^[a-f0-9]{64}$/;

// A fresh reset token: `token` goes in the email link, `hash` goes in the DB.
function generateResetToken() {
  const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
  return { token, hash: hashResetToken(token) };
}

// SHA-256 of a well-formed token, or null for anything that isn't one
// (so junk from the query string never reaches SQL).
function hashResetToken(token) {
  if (typeof token !== 'string' || !RESET_TOKEN_RE.test(token)) return null;
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Where to send someone after signing in. Only same-site absolute paths are
// allowed ("/app/goals?x=1"); anything that could leave the site — "//evil",
// "/\evil", "https://…", control characters — falls back to `fallback`.
function safeRedirectPath(value, fallback = '/app') {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  // Never bounce back into the auth pages themselves.
  if (/^\/(login|logout|signup|forgot-password|reset-password|unlock-account|verify-email)(\/|\?|#|$)/.test(value)) return fallback;
  return value;
}

module.exports = { RESET_TOKEN_RE, generateResetToken, hashResetToken, safeRedirectPath };
