// routes/reset.js
// Serves /reset-password (the link from the reset email). Figma "Resetting
// password from Logging in": Create your password → Confirm your new password
// → Password reset successful.
//
// Security (test/reset-flow.test.js):
//  - the emailed token is never stored; users.reset_token holds its SHA-256
//    (lib/auth-tokens.js), so lookup-by-hash is not a timing side channel;
//  - tokens expire after 1 hour (routes/auth.js RESET_TOKEN_TTL);
//  - consumption is ONE atomic UPDATE (db/users.consumeResetToken) — single use
//    even under concurrent submits;
//  - after a reset every other session for that user is destroyed server-side;
//  - the page is no-store / no-referrer so the token doesn't leak via cache or
//    the Referer header.

const { safeError } = require('../lib/safe-log');
const express = require('express');
const router = express.Router();
const { authLimiter } = require('../lib/rate-limiters');
const bcrypt = require('bcryptjs');

const users = require('../db/users');
const sessions = require('../db/sessions');
const { passwordStrengthError } = require('../lib/password-rules');
const { hashResetToken } = require('../lib/auth-tokens');

const INVALID_LINK = 'This reset link is invalid or has expired. Request a new one below.';

function noLeak(res) {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
}

function render(res, locals) {
  noLeak(res);
  res.render('auth-reset-password', {
    layout: false, error: null, success: null, token: '', step: 'create', ...locals,
  });
}

async function showResetPage(req, res) {
  const { token } = req.query;
  if (!token) return res.redirect('/forgot-password');
  const user = await users.findUserByResetToken(hashResetToken(token));
  if (!user) return render(res, { token: '', error: INVALID_LINK });
  render(res, { token });
}

async function submitReset(req, res) {
  const token = typeof req.body.token === 'string' ? req.body.token : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const confirm = typeof req.body.confirm === 'string' ? req.body.confirm : '';
  const tokenHash = hashResetToken(token);
  if (!tokenHash) return render(res, { token: '', error: INVALID_LINK });

  // Same rules as sign-up (lib/password-rules.js), so a reset can't set a
  // password that sign-up would reject.
  const strengthError = passwordStrengthError(password);
  if (strengthError) return render(res, { token, error: strengthError, step: 'create' });
  // (The page checks this before submitting too; the password is never echoed
  // back, so a mismatch restarts at the Create step.)
  if (password !== confirm) {
    return render(res, { token, error: "Those passwords don't match. Please enter your new password again.", step: 'create' });
  }

  const hash = await bcrypt.hash(password, 12);
  const user = await users.consumeResetToken(tokenHash, hash);
  if (!user) return render(res, { token: '', error: INVALID_LINK });

  // Sign the account out everywhere else. If this browser happens to be signed
  // in as the same user, keep it; any other signed-in session is dropped.
  const keepSid = req.session && String(req.session.userId) === String(user.id) ? req.sessionID : null;
  try {
    await sessions.destroyUserSessions(user.id, keepSid);
  } catch (e) {
    console.error('[reset] could not revoke other sessions:', safeError(e));
  }

  render(res, { success: true, token: '' });
}

router.get('/reset-password', showResetPage);
router.post('/reset-password', authLimiter, submitReset);

module.exports = router;
module.exports._handlers = { showResetPage, submitReset, INVALID_LINK };
