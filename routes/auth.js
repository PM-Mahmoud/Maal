// routes/auth.js

const { safeError } = require('../lib/safe-log');
const express = require('express');
const router = express.Router();
const { authLimiter, otpLimiter } = require('../lib/rate-limiters');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');

const {
  createUser, findUserByEmail, findUserById,
  setResetToken, findUserByResetToken, setPasswordHash,
  setOtp, findUserByOtp, clearOtp,
  incrementFailedAttempts, lockUser, resetFailedAttempts, recordLogin,
  markEmailVerified, setPhone,
  incrementOtpAttempts, resetOtpAttempts, getOtpLockStatus,
} = require('../db/users');

const { sendEmail } = require('../services/email');
const { sendOtpSms } = require('../services/sms');
const waitlistAccess = require('../services/waitlist-access');
const { isGateOn } = require('../lib/waitlist-gate');

const RESET_TOKEN_TTL  = 3600 * 1000;       // 1 hour
const OTP_TTL          = 10 * 60 * 1000;    // 10 minutes
const MAX_ATTEMPTS     = 5;
const LOCK_DURATION    = 15 * 60 * 1000;    // 15 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateOtp() {
  // Use crypto.randomInt for cryptographically secure OTP generation
  return crypto.randomInt(100000, 1000000).toString();
}

function getIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

// New-account password rules (8–64 chars, upper, lower, number, special) —
// shared with the sign-up page's live checklist.
const { passwordStrengthError } = require('../lib/password-rules');
const { generateResetToken, safeRedirectPath } = require('../lib/auth-tokens');

async function sendOtpEmail(email, name, otp) {
  const firstName = (name || '').split(' ')[0] || 'there';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0A0F0D;font-family:'DM Sans',system-ui,sans-serif;color:#F0EFE9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0F0D;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0F2E24;border:1px solid rgba(201,168,76,0.15);border-radius:16px;max-width:560px;width:100%;">
        <tr><td style="padding:40px;">
          <p style="margin:0 0 24px;font-size:1.4rem;font-weight:600;color:#C9A84C;">◈ Maal</p>
          <h1 style="margin:0 0 12px;font-size:1.4rem;font-weight:600;">Your verification code</h1>
          <p style="margin:0 0 28px;font-size:0.9rem;color:#8A8D83;line-height:1.6;">Hi ${firstName}, enter this code to verify your email address. It expires in 10 minutes.</p>
          <div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
            <span style="font-size:2.4rem;font-weight:700;letter-spacing:0.3em;color:#C9A84C;">${otp}</span>
          </div>
          <p style="margin:0;font-size:0.78rem;color:#8A8D83;">If you didn't create a Maal account, you can ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  sendEmail({ to: email, subject: 'Your Maal verification code', html, text: `Your Maal verification code: ${otp}\nExpires in 10 minutes.` })
    .catch(err => console.error('[auth] OTP email FAILED — user will not receive their code and will be stuck at /verify-email. Check RESEND_API_KEY / EMAIL_FROM (verified domain) in the host env and Resend dashboard Logs. Error:', safeError(err)));
}

// ─── Page: /login ─────────────────────────────────────────────────────────────

// Messages for the ?error= codes routes/oauth.js redirects back with.
const LOGIN_ERRORS = {
  google_not_configured: 'Google sign-in isn’t available right now. Please sign in with your email.',
  google_denied: 'Google sign-in was cancelled. Try again, or sign in with your email.',
  invalid_state: 'That Google sign-in expired. Please try again.',
  google_token_failed: 'We couldn’t finish signing you in with Google. Please try again.',
  no_email: 'Your Google account didn’t share an email address, so we couldn’t sign you in.',
  google_failed: 'We couldn’t finish signing you in with Google. Please try again.',
};

// Where to go after signing in: ?next= (or the legacy ?redirect=), carried
// through the forms as a hidden field. Only same-site paths survive.
function requestedNext(req) {
  const raw = (req.body && req.body.next) || req.query.next || req.query.redirect;
  const safe = safeRedirectPath(raw, '');
  return safe || '';
}

function renderLogin(req, res, locals) {
  res.render('auth-login', {
    layout: false, error: null, notice: null, email: '', next: requestedNext(req), ...locals,
  });
}

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect(requestedNext(req) || '/app');
  const error = LOGIN_ERRORS[req.query.error] || null;
  const notice = req.query.signed_out ? 'You’ve been logged out. See you soon.'
    : req.query.reset ? 'Your password has been reset. Sign in with your new password.'
    : null;
  renderLogin(req, res, { error, notice, email: '' });
});

router.post('/login', authLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return renderLogin(req, res, { error: 'Please enter a valid email and password.', email: req.body.email });
    }

    const { email, password } = req.body;
    const user = await findUserByEmail(email);

    if (!user || !user.password_hash) {
      return renderLogin(req, res, { error: 'No account found with that email. Try signing up.', email });
    }

    // Check lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
      return renderLogin(req, res, { error: `Account locked after too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, email });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const attempts = await incrementFailedAttempts(user.id);
      if (attempts >= MAX_ATTEMPTS) {
        await lockUser(user.id, new Date(Date.now() + LOCK_DURATION));
        return renderLogin(req, res, { error: `Too many failed attempts. Account locked for 15 minutes.`, email });
      }
      const remaining = MAX_ATTEMPTS - attempts;
      return renderLogin(req, res, { error: `Incorrect password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.`, email });
    }

    // Check email verified
    if (!user.email_verified) {
      // Resend OTP and send to verify page
      const otp = generateOtp();
      await setOtp(user.id, otp, new Date(Date.now() + OTP_TTL));
      try { await sendOtpEmail(user.email, user.name, otp); }
      catch (e) { console.error('[login] OTP email failed (continuing to /verify-email):', safeError(e)); }
      req.session.pendingEmail = user.email;
      // Unverified existing account finishing signup verification → onboarding.
      req.session.otpPurpose = 'verify';
      return req.session.save(() => res.redirect('/verify-email'));
    }

    // Two-factor authentication — verified password, now require an email code.
    // Reuses the OTP machinery: /verify-email completes the sign-in.
    if (user.two_factor_enabled) {
      const otp = generateOtp();
      await setOtp(user.id, otp, new Date(Date.now() + OTP_TTL));
      try { await sendOtpEmail(user.email, user.name, otp); }
      catch (e) { console.error('[login] 2FA OTP email failed (continuing to /verify-email):', safeError(e)); }
      req.session.pendingEmail = user.email;
      // 2FA on an established account — completing it is a login, not signup.
      req.session.otpPurpose = 'login';
      req.session.postLoginRedirect = requestedNext(req) || null;
      return req.session.save(() => res.redirect('/verify-email'));
    }

    await resetFailedAttempts(user.id);
    await recordLogin(user.id, getIp(req));

    // SECURITY: regenerate session ID before writing auth state (prevents session fixation)
    const pendingLink = req.session.pendingGoogleLink || null;
    const next = requestedNext(req) || '/app';
    req.session.regenerate((regenErr) => {
      if (regenErr) { console.error('[login] Session regenerate error:', safeError(regenErr)); return res.status(500).render('error', { layout: false, message: 'Session error.' }); }
      req.session.userId = user.id;
      req.session.email = user.email;
      req.session.name = user.name;
      req.session.provider = user.provider;
      req.session.emailVerified = true;

      // Complete any pending Google account link after password confirmation.
      if (pendingLink) {
        const { googleId, email: googleEmail } = pendingLink;
        if (user.email.toLowerCase() === googleEmail.toLowerCase()) {
          const pool = require('../db/pool');
          pool.query(
            `UPDATE users SET provider_id = $1, provider = 'google', email_verified = true, updated_at = NOW() WHERE id = $2`,
            [googleId, user.id]
          ).then(() => {
            console.log('[oauth] Linked Google account after password consent');
          }).catch((linkErr) => {
            console.error('[oauth] Google link failed after login:', safeError(linkErr));
          });
        }
      }

      req.session.save((err) => {
        if (err) console.error('[login] Session save error:', safeError(err));
        // SECURITY: ?next= is validated by safeRedirectPath (no open redirect).
        res.redirect(next);
      });
    });
  }
);

// ─── Page: /signup ────────────────────────────────────────────────────────────

router.get('/signup', (req, res) => {
  if (req.session.userId) return res.redirect('/app');
  const error = req.query.invite === 'required' ? waitlistAccess.NOT_INVITED_MESSAGE : null;
  // Arrived through a friend's referral link: no invite-only notice.
  const referred = !!req.session.referralCode;
  res.render('auth-signup', { layout: false, error, notInvited: !!error, gated: isGateOn() && !referred, referred, email: '', name: '' });
});

router.post('/signup', authLimiter,
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8, max: 64 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('auth-signup', { layout: false, error: 'Please fill in all fields. Password must be 8 to 64 characters.', email: req.body.email, name: req.body.name });
    }

    const { name, email, password } = req.body;

    // Password strength
    const strengthError = passwordStrengthError(password);
    if (strengthError) {
      return res.render('auth-signup', { layout: false, error: strengthError, email, name });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.render('auth-signup', { layout: false, error: 'An account with this email already exists. Sign in instead.', email, name });
    }
    if (!(await waitlistAccess.canSignUp(email, req.session.referralCode))) {
      return res.render('auth-signup', { layout: false, error: waitlistAccess.NOT_INVITED_MESSAGE, notInvited: true, gated: true, email, name });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { phone } = req.body;
    const user = await createUser({ email, name, passwordHash, provider: 'credentials' });
    waitlistAccess.recordJoined(email);
    await require('../services/referrals').onSignup(req, user);
    await require('../db/training-consents').recordSignupGrant(user.id, 'signup');

    // Save phone if provided
    if (phone && phone.trim()) {
      await setPhone(user.id, phone.trim());
      req.session.pendingPhone = phone.trim();
    }

    // Generate and send OTP. Email failure must NOT fail the signup — the user
    // row already exists, so a 500 here strands them ("account already exists"
    // on retry). Land them on /verify-email where they can hit resend instead.
    const otp = generateOtp();
    await setOtp(user.id, otp, new Date(Date.now() + OTP_TTL));
    try {
      await sendOtpEmail(email, name, otp);
    } catch (e) {
      console.error('[signup] OTP email failed (user created, continuing to /verify-email):', safeError(e));
    }

    // Store pending email in session for the verify page. Set the purpose
    // explicitly: a stale 'login' left over from an abandoned passwordless
    // sign-in would otherwise skip this new user past onboarding.
    req.session.pendingEmail = email;
    req.session.otpPurpose = 'signup';
    req.session.save((err) => {
      if (err) console.error('[signup] Session save error:', safeError(err));
      res.redirect('/verify-email');
    });
  }
);

// ─── API: /login/email-code — request a passwordless sign-in code ────────────

router.post('/login/email-code', authLimiter,
  body('email').isEmail().normalizeEmail(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return renderLogin(req, res, { error: 'Please enter a valid email address.', email: req.body.email || '' });
    }

    const { email } = req.body;
    const user = await findUserByEmail(email);
    if (!user) {
      return renderLogin(req, res, { error: 'No account found with that email. Try signing up.', email });
    }

    const otp = generateOtp();
    await setOtp(user.id, otp, new Date(Date.now() + OTP_TTL));
    await sendOtpEmail(user.email, user.name, otp);

    req.session.pendingEmail = user.email;
    req.session.otpPurpose = 'login';
    req.session.postLoginRedirect = requestedNext(req) || null;
    req.session.save(() => res.redirect('/verify-email'));
  }
);

// ─── API: /signup/email-code — passwordless account creation ─────────────────

router.post('/signup/email-code', authLimiter,
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('email').isEmail().normalizeEmail(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('auth-signup', { layout: false, error: 'Please enter your name and a valid email address.', email: req.body.email || '', name: req.body.name || '' });
    }

    const { name, email } = req.body;
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.render('auth-signup', { layout: false, error: 'An account with this email already exists. Sign in instead.', email, name });
    }
    if (!(await waitlistAccess.canSignUp(email, req.session.referralCode))) {
      return res.render('auth-signup', { layout: false, error: waitlistAccess.NOT_INVITED_MESSAGE, notInvited: true, gated: true, email, name });
    }

    const user = await createUser({ email, name, passwordHash: null, provider: 'credentials' });
    waitlistAccess.recordJoined(email);
    await require('../services/referrals').onSignup(req, user);
    await require('../db/training-consents').recordSignupGrant(user.id, 'signup');

    const otp = generateOtp();
    await setOtp(user.id, otp, new Date(Date.now() + OTP_TTL));
    await sendOtpEmail(email, name, otp);

    req.session.pendingEmail = email;
    req.session.otpPurpose = 'signup';
    req.session.save((err) => {
      if (err) console.error('[signup/email-code] Session save error:', safeError(err));
      res.redirect('/verify-email');
    });
  }
);

// ─── Page: /verify-email (OTP entry) ─────────────────────────────────────────

// `purpose` only changes the copy on the code screen (views/auth-verify-otp.ejs):
// 'login' = passwordless or 2FA sign-in, anything else = confirming a new email.
function renderOtp(req, res, locals) {
  const purpose = req.session.otpPurpose === 'login' ? 'login' : 'verify';
  res.render('auth-verify-otp', { layout: false, error: null, purpose, ...locals });
}

router.get('/verify-email', (req, res) => {
  const email = req.session.pendingEmail || req.query.email || '';
  if (!email) return res.redirect('/signup');
  renderOtp(req, res, { email, error: null });
});

router.post('/verify-email', otpLimiter, async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return renderOtp(req, res, { email: email || '', error: 'Please enter the 6-digit code.' });
  }

  // Brute-force lock: look up user by email first, check lock status
  const userForLock = await findUserByEmail(email).catch(() => null);
  if (userForLock) {
    const lockStatus = await getOtpLockStatus(userForLock.id);
    if (lockStatus?.otp_locked_until && new Date(lockStatus.otp_locked_until) > new Date()) {
      const mins = Math.ceil((new Date(lockStatus.otp_locked_until) - Date.now()) / 60000);
      return renderOtp(req, res, { email, error: `Too many failed attempts. Try again in ${mins} minute(s).` });
    }
  }

  const user = await findUserByOtp(email, code.trim());
  if (!user) {
    if (userForLock) await incrementOtpAttempts(userForLock.id);
    return renderOtp(req, res, { email, error: 'Invalid or expired code. Check your email or request a new code.' });
  }

  await resetOtpAttempts(user.id);
  await markEmailVerified(user.id);
  await clearOtp(user.id);
  await recordLogin(user.id, getIp(req));

  // A code requested from the sign-in page (not signup/2FA) is an existing user
  // logging in passwordlessly — send them straight to the dashboard, not onboarding.
  const isPasswordlessLogin = req.session.otpPurpose === 'login';
  const loginNext = safeRedirectPath(req.session.postLoginRedirect, '/app');

  // SECURITY: regenerate session ID to prevent fixation
  req.session.regenerate((regenErr) => {
    if (regenErr) { console.error('[verify-otp] Session regenerate error:', safeError(regenErr)); return res.status(500).render('error', { layout: false, message: 'Session error.' }); }
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.name = user.name;
    req.session.provider = 'credentials';
    req.session.emailVerified = true;
    req.session.save((err) => {
      if (err) console.error('[verify-otp] Session save error:', safeError(err));
      // React app owns both destinations now: the EJS /dashboard is retired and
      // the EJS /onboarding wizard is legacy — new users get the React flow.
      // New accounts go through the welcome flow (onboarding v2, PR 4).
      res.redirect(isPasswordlessLogin ? loginNext : '/welcome');
    });
  });
});

// ─── API: /resend-otp ─────────────────────────────────────────────────────────

router.post('/resend-otp', otpLimiter, async (req, res) => {
  const email = req.body.email || req.session.pendingEmail;
  if (!email) return res.status(400).json({ error: 'No email' });

  // SECURITY: always return 200 regardless of whether user exists (prevents email enumeration)
  try {
    const user = await findUserByEmail(email);
    // Sign-in codes (passwordless / email 2FA) can be resent too, but only for
    // the address this browser is already mid-sign-in for.
    const resendingLoginCode = req.session.otpPurpose === 'login' &&
      typeof req.session.pendingEmail === 'string' &&
      req.session.pendingEmail.toLowerCase() === String(email).toLowerCase();
    if (user && (!user.email_verified || resendingLoginCode)) {
      const otp = generateOtp();
      await setOtp(user.id, otp, new Date(Date.now() + OTP_TTL));
      await resetOtpAttempts(user.id);
      await sendOtpEmail(email, user.name, otp);
    }
  } catch (e) {
    console.error('[resend-otp] error:', safeError(e));
  }
  res.json({ ok: true, message: 'If that email is registered and unverified, a new code has been sent.' });
});


// ─── API: /resend-otp-sms ─────────────────────────────────────────────────────

router.post('/resend-otp-sms', otpLimiter, async (req, res) => {
  const email = req.body.email || req.session.pendingEmail;
  const phone = req.session.pendingPhone;
  if (!email) return res.status(400).json({ error: 'No email' });
  if (!phone) return res.status(400).json({ error: 'No phone number on file for this account.' });

  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.email_verified) return res.json({ ok: true });

  const otp = generateOtp();
  await setOtp(user.id, otp, new Date(Date.now() + OTP_TTL));
  await resetOtpAttempts(user.id);
  try {
    await sendOtpSms(phone, otp);
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] SMS send failed:', safeError(err));
    res.status(500).json({ error: 'Failed to send SMS. Try email instead.' });
  }
});

// ─── Page: /forgot-password ────────────────────────────────────────────────────
// Figma "Resetting password from Logging in": Reset your password → Check your
// email. The "check your email" screen is shown for EVERY well-formed address
// (registered or not), and the lookup + token write + email run after the
// response is sent, so neither the copy nor the response time reveals whether
// an account exists.

function resetEmailHtml(resetUrl) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8F9F6;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:#202120;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9F6;padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #E6E6E6;border-radius:20px;max-width:520px;width:100%;">
        <tr><td style="padding:40px 36px;text-align:center;">
          <p style="margin:0 0 28px;font-family:Lora,Georgia,serif;font-size:22px;color:#202120;">Maal</p>
          <h1 style="margin:0 0 12px;font-family:Lora,Georgia,serif;font-weight:400;font-size:28px;color:#202120;">Reset your password</h1>
          <p style="margin:0 0 28px;font-size:15px;color:#666666;line-height:1.6;">Use the button below to choose a new password. The link works once and expires in 1 hour.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#020109;color:#FFFFFF;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;">Reset password</a>
          <p style="margin:28px 0 0;font-size:12.5px;color:#999999;line-height:1.6;">Didn’t ask to reset your password? You can ignore this email — your password won’t change.</p>
        </td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:11px;color:#999999;max-width:520px;line-height:1.6;">Maal does not provide financial advice. Any information provided by Maal is for educational purposes only. You should do your own research. Investing is risky and you can lose all of your money.</p>
    </td></tr>
  </table>
</body></html>`;
}

async function sendResetLink(email) {
  const user = await findUserByEmail(email);
  if (!user) return;
  const { token, hash } = generateResetToken();
  await setResetToken(user.id, hash, new Date(Date.now() + RESET_TOKEN_TTL));
  const resetUrl = `${process.env.BASE_URL || 'https://hellomaal.com'}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email, subject: 'Reset your Maal password', html: resetEmailHtml(resetUrl),
    text: `Reset your Maal password (link works once, expires in 1 hour): ${resetUrl}\n\nDidn't ask for this? Ignore this email.`,
  });
}

router.get('/forgot-password', (req, res) => {
  res.render('auth-forgot-password', { layout: false, error: null, sent: false, email: '' });
});

router.post('/forgot-password', authLimiter,
  body('email').isEmail().normalizeEmail(),
  (req, res) => {
    if (!validationResult(req).isEmpty()) {
      return res.render('auth-forgot-password', { layout: false, error: 'Please enter a valid email address.', sent: false, email: req.body.email || '' });
    }
    // Respond first; do the work after (constant response time, no enumeration).
    setImmediate(() => {
      sendResetLink(req.body.email).catch((err) => console.error('[auth] Reset email failed:', safeError(err)));
    });
    res.render('auth-forgot-password', { layout: false, error: null, sent: true, email: '' });
  }
);

// ─── API: delete account (called from Settings) ───────────────────────────────

router.post('/api/account/delete', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not signed in.' });
  const { isDeletionConfirmed, DELETION_CONFIRMATION } = require('../lib/collaboration');
  const confirmation = req.body && (req.body.confirmation || req.body.confirm);
  if (!isDeletionConfirmed(confirmation)) {
    return res.status(400).json({ error: `Type ${DELETION_CONFIRMATION} to confirm permanent deletion.` });
  }
  try {
    // Erasure (services/account-deletion.js): cancels Stripe billing first,
    // cascades every per-user table, purges other devices' sessions and
    // removes Vault files from object storage.
    const { findUserById } = require('../db/users');
    const user = await findUserById(req.session.userId);
    const result = await require('../services/account-deletion').deleteAccount(req.session.userId);
    if (!result.deleted) return req.session.destroy(() => res.status(404).json({ error: 'Account not found.' }));
    if (user && user.email) {
      sendEmail({
        to: user.email,
        subject: 'Your Maal account has been deleted',
        text: 'Your Maal account and the financial data in it have been permanently deleted, and any active membership has been cancelled. If you did not ask for this, reply to this email straight away.',
        html: '<p>Your Maal account and the financial data in it have been permanently deleted, and any active membership has been cancelled.</p><p>If you did not ask for this, reply to this email straight away.</p>',
      }).catch((e) => console.error('[account-delete] confirmation email failed:', safeError(e)));
    }
    req.session.destroy(() => res.json({ ok: true }));
  } catch (err) {
    if (err.code === 'billing_cancel_failed') {
      return res.status(502).json({ error: "We couldn't cancel your membership, so nothing has been deleted. Please try again, or contact support." });
    }
    console.error('Delete account error:', safeError(err));
    res.status(500).json({ error: 'Failed to delete account.' });
  }
});

// ─── API: change phone number (Settings → Profile, SMS-verified) ──────────────
// The new number is held in the session with a hashed 6-digit code; users.phone
// only changes once the code is confirmed. Pure logic: lib/profile-details.js.

router.post('/api/account/phone/send-code', otpLimiter, async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not signed in.' });
  const pd = require('../lib/profile-details');
  const phone = pd.normalisePhone(req.body && req.body.country, req.body && req.body.number);
  if (!phone) {
    return res.status(400).json({ error: 'Enter a valid mobile number, for example 0412 345 678.' });
  }
  const wait = pd.resendWaitSeconds(req.session.phoneVerify);
  if (wait > 0 && req.session.phoneVerify.phone === phone) {
    return res.status(429).json({ error: `Wait ${wait}s before requesting another code.`, retryAfter: wait });
  }
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    return res.status(503).json({ error: "Text messages aren't available right now, so your number can't be verified. Please try again later." });
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  try {
    await sendOtpSms(phone, code);
  } catch (e) {
    console.error('[phone-verify] SMS send failed:', safeError(e));
    return res.status(502).json({ error: "We couldn't send a text to that number. Check it and try again." });
  }
  req.session.phoneVerify = pd.createPhoneChallenge(phone, code);
  req.session.save(() => res.json({ ok: true, phone: pd.formatPhone(phone), resendIn: Math.round(pd.PHONE_RESEND_MS / 1000) }));
});

router.post('/api/account/phone/verify', otpLimiter, async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not signed in.' });
  const pd = require('../lib/profile-details');
  const state = req.session.phoneVerify;
  const result = pd.checkPhoneCode(state, req.body && req.body.code);
  if (!result.ok) {
    if (result.reason === 'expired' || result.reason === 'locked') delete req.session.phoneVerify;
    return req.session.save(() => res.status(400).json({ error: result.error, reason: result.reason }));
  }
  try {
    await setPhone(req.session.userId, result.phone);
    delete req.session.phoneVerify;
    req.session.save(() => res.json({ ok: true, phone: result.phone }));
  } catch (e) {
    console.error('[phone-verify] save failed:', safeError(e));
    res.status(500).json({ error: 'Could not save your number. Please try again.' });
  }
});

// ─── Logout ────────────────────────────────────────────────────────────────────
// Figma "Logging out": Logout → the sign-in page. POST only (a GET that signs
// you out can be triggered by any <img> on another site); the session cookie is
// SameSite=Lax, so a cross-site form POST arrives without it and does nothing.
// The session row is destroyed server-side and the cookie cleared.
// The React app calls the JSON twin, POST /api/auth/logout (routes/api.js).

const SESSION_COOKIE = 'connect.sid';

function logout(req, res) {
  req.session.destroy((err) => {
    if (err) console.error('[logout] session destroy failed:', safeError(err));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.redirect(303, '/login?signed_out=1');
  });
}

router.post('/logout', logout);
// Old bookmarks / links: never sign out on GET — just route to the right place.
router.get('/logout', (req, res) => res.redirect(req.session.userId ? '/app' : '/login'));

module.exports = router;
