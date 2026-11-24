'use strict';
// routes/account-security.js — two-factor authentication management for the
// React Settings → Security page (/app/settings/security).
//
// Maal's 2FA is email-code based: users.two_factor_enabled makes sign-in email a
// 6-digit code (routes/auth.js, reusing the OTP columns). This router lets a
// signed-in user turn it on/off safely:
//   GET  /api/v1/security/2fa          → { enabled, method, email (masked), hasPassword }
//   POST /api/v1/security/2fa/start    → { purpose: 'enable'|'disable' } emails a code
//   POST /api/v1/security/2fa/confirm  → { code } verifies the code, then applies the purpose
//   POST /api/v1/security/2fa/disable  → { password } re-auth with password, then turns 2FA off
//
// Safety: enabling ALWAYS requires proving the inbox works (a fresh code);
// disabling requires re-authentication (password, or an emailed code for
// accounts without one, e.g. Google sign-in). Code checks reuse the existing
// OTP brute-force lock (5 wrong codes → 15-minute lock) and the routes are
// IP rate-limited. Codes and emails are never logged.
//
// Mounted at /api in server.js BEFORE routes/api.js so the generic /v1/:table
// handler never sees these paths. Every DB call is keyed by req.session.userId.

const { safeError } = require('../lib/safe-log');
const express = require('express');
const crypto = require('crypto');

const CODE_TTL_MS = 10 * 60 * 1000;

function maskEmail(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at < 1) return '';
  const local = s.slice(0, at);
  const shown = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${shown}${'•'.repeat(Math.max(1, Math.min(6, local.length - shown.length)))}${s.slice(at)}`;
}

// Accepts "123456", "123 456", "123-456"; returns the 6 digits or null.
function normaliseCode(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const digits = String(raw).replace(/[\s-]/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

function codeEmail(code, purpose) {
  const action = purpose === 'disable' ? 'turn off two-factor authentication' : 'turn on two-factor authentication';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8F9F6;font-family:Inter,system-ui,sans-serif;color:#202321;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9F6;padding:40px 16px;"><tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #E5E5E2;border-radius:16px;max-width:520px;width:100%;"><tr><td style="padding:36px;">
      <p style="margin:0 0 20px;font-size:18px;font-weight:600;color:#08090B;">Maal</p>
      <h1 style="margin:0 0 10px;font-size:22px;font-weight:500;font-family:Lora,Georgia,serif;color:#08090B;">Your security code</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#646663;line-height:1.6;">Enter this code in Maal to ${action}. It expires in 10 minutes.</p>
      <div style="background:#F8F9F6;border:1px solid #E5E5E2;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
        <span style="font-size:32px;font-weight:600;letter-spacing:0.3em;color:#08090B;">${code}</span>
      </div>
      <p style="margin:0;font-size:12px;color:#929491;line-height:1.6;">If you didn't ask for this, someone may know your password. Change it from Settings and keep this code to yourself.</p>
    </td></tr></table>
  </td></tr></table>
</body></html>`;
  return { subject: 'Your Maal security code', html, text: `Your Maal security code: ${code}\nUse it to ${action}. Expires in 10 minutes.` };
}

function createAccountSecurityRouter({
  users = require('../db/users'),
  bcrypt = require('bcryptjs'),
  sendEmail = (...a) => require('../services/email').sendEmail(...a),
  generateCode = () => crypto.randomInt(100000, 1000000).toString(),
  limiters = require('../lib/rate-limiters'),
  now = () => Date.now(),
} = {}) {
  const router = express.Router();

  function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    next();
  }

  function fail(res, where, e) {
    console.error(`[account-security] ${where} failed:`, safeError(e));
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }

  async function loadUser(req) {
    const user = await users.findUserById(req.session.userId);
    if (!user) return null;
    // findUserById omits password_hash; read it by the session user's own email.
    const full = await users.findUserByEmail(user.email);
    const hasPassword = !!(full && full.id === user.id && full.password_hash);
    return { user, hasPassword, passwordHash: hasPassword ? full.password_hash : null };
  }

  function lockedUntil(status) {
    if (!status || !status.otp_locked_until) return null;
    const t = new Date(status.otp_locked_until).getTime();
    return t > now() ? t : null;
  }

  router.get('/v1/security/2fa', requireAuth, async (req, res) => {
    try {
      const u = await loadUser(req);
      if (!u) return res.status(401).json({ error: 'Not authenticated' });
      res.json({
        enabled: !!u.user.two_factor_enabled,
        method: 'email',
        email: maskEmail(u.user.email),
        hasPassword: u.hasPassword,
        pending: req.session.twoFactorSetup ? req.session.twoFactorSetup.purpose : null,
      });
    } catch (e) { fail(res, 'status', e); }
  });

  router.post('/v1/security/2fa/start', limiters.otpLimiter, requireAuth, async (req, res) => {
    const purpose = req.body && req.body.purpose;
    if (purpose !== 'enable' && purpose !== 'disable') return res.status(400).json({ error: 'Unknown request.' });
    try {
      const u = await loadUser(req);
      if (!u) return res.status(401).json({ error: 'Not authenticated' });
      const enabled = !!u.user.two_factor_enabled;
      if (purpose === 'enable' && enabled) return res.status(409).json({ error: 'Two-factor authentication is already on.' });
      if (purpose === 'disable' && !enabled) return res.status(409).json({ error: 'Two-factor authentication is already off.' });
      // Password accounts turn 2FA off with their password (re-auth), not an inbox code.
      if (purpose === 'disable' && u.hasPassword) return res.status(400).json({ error: 'Confirm your password to turn this off.', code: 'password_required' });
      const lock = lockedUntil(await users.getOtpLockStatus(u.user.id));
      if (lock) return res.status(429).json({ error: 'Too many incorrect codes. Try again in 15 minutes.', code: 'locked' });

      const code = generateCode();
      await users.setOtp(u.user.id, code, new Date(now() + CODE_TTL_MS));
      req.session.twoFactorSetup = { purpose, issuedAt: now() };
      await new Promise((ok, err) => req.session.save ? req.session.save((e) => (e ? err(e) : ok())) : ok());
      const mail = codeEmail(code, purpose);
      Promise.resolve(sendEmail({ to: u.user.email, ...mail }))
        .catch((e) => console.error('[account-security] code email failed:', safeError(e)));
      res.json({ ok: true, sentTo: maskEmail(u.user.email), expiresInSeconds: CODE_TTL_MS / 1000 });
    } catch (e) { fail(res, 'start', e); }
  });

  router.post('/v1/security/2fa/confirm', limiters.authLimiter, requireAuth, async (req, res) => {
    const setup = req.session.twoFactorSetup;
    if (!setup || (setup.purpose !== 'enable' && setup.purpose !== 'disable')) {
      return res.status(400).json({ error: 'Request a new code first.', code: 'no_pending' });
    }
    if (now() - Number(setup.issuedAt || 0) > CODE_TTL_MS) {
      delete req.session.twoFactorSetup;
      return res.status(400).json({ error: 'That code has expired. Request a new one.', code: 'expired' });
    }
    const code = normaliseCode(req.body && req.body.code);
    if (!code) return res.status(400).json({ error: 'Enter the 6-digit code from your email.', code: 'invalid_format' });
    try {
      const u = await loadUser(req);
      if (!u) return res.status(401).json({ error: 'Not authenticated' });
      if (lockedUntil(await users.getOtpLockStatus(u.user.id))) {
        return res.status(429).json({ error: 'Too many incorrect codes. Try again in 15 minutes.', code: 'locked' });
      }
      const match = await users.findUserByOtp(u.user.email, code);
      if (!match || match.id !== u.user.id) {
        const st = await users.incrementOtpAttempts(u.user.id);
        if (lockedUntil(st)) return res.status(429).json({ error: 'Too many incorrect codes. Try again in 15 minutes.', code: 'locked' });
        return res.status(400).json({ error: 'That code isn’t right. Check your email and try again.', code: 'wrong_code' });
      }
      await users.clearOtp(u.user.id);
      await users.resetOtpAttempts(u.user.id);
      const enable = setup.purpose === 'enable';
      await users.setTwoFactor(u.user.id, enable);
      delete req.session.twoFactorSetup;
      res.json({ ok: true, enabled: enable });
    } catch (e) { fail(res, 'confirm', e); }
  });

  router.post('/v1/security/2fa/disable', limiters.authLimiter, requireAuth, async (req, res) => {
    const password = req.body && req.body.password;
    if (typeof password !== 'string' || !password) return res.status(400).json({ error: 'Enter your password.' });
    try {
      const u = await loadUser(req);
      if (!u) return res.status(401).json({ error: 'Not authenticated' });
      if (!u.user.two_factor_enabled) return res.status(409).json({ error: 'Two-factor authentication is already off.' });
      if (!u.hasPassword) return res.status(400).json({ error: 'Your account signs in without a password — we’ll email you a code instead.', code: 'code_required' });
      if (lockedUntil(await users.getOtpLockStatus(u.user.id))) {
        return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.', code: 'locked' });
      }
      const ok = await bcrypt.compare(password, u.passwordHash);
      if (!ok) {
        const st = await users.incrementOtpAttempts(u.user.id);
        if (lockedUntil(st)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.', code: 'locked' });
        return res.status(400).json({ error: 'That password isn’t right.', code: 'wrong_password' });
      }
      await users.resetOtpAttempts(u.user.id);
      await users.setTwoFactor(u.user.id, false);
      delete req.session.twoFactorSetup;
      res.json({ ok: true, enabled: false });
    } catch (e) { fail(res, 'disable', e); }
  });

  return router;
}

module.exports = createAccountSecurityRouter();
module.exports.createAccountSecurityRouter = createAccountSecurityRouter;
module.exports.maskEmail = maskEmail;
module.exports.normaliseCode = normaliseCode;
module.exports.CODE_TTL_MS = CODE_TTL_MS;
