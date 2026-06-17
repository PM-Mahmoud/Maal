// routes/auth.js

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');

const {
  createUser, findUserByEmail, findUserById,
  setResetToken, findUserByResetToken, setPasswordHash,
  setOtp, findUserByOtp, clearOtp,
  incrementFailedAttempts, lockUser, resetFailedAttempts, recordLogin,
  markEmailVerified, setPhone,
} = require('../db/users');

const { sendEmail } = require('../services/email');
const { sendOtpSms } = require('../services/sms');

const RESET_TOKEN_TTL  = 3600 * 1000;       // 1 hour
const OTP_TTL          = 10 * 60 * 1000;    // 10 minutes
const MAX_ATTEMPTS     = 5;
const LOCK_DURATION    = 15 * 60 * 1000;    // 15 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function passwordStrengthError(password) {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  return null;
}

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
    .catch(err => console.error('[auth] OTP email failed:', err.message));
}

// ─── Page: /login ─────────────────────────────────────────────────────────────

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('auth-login', { layout: false, error: null, email: '' });
});

router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('auth-login', { layout: false, error: 'Please enter a valid email and password.', email: req.body.email });
    }

    const { email, password } = req.body;
    const user = await findUserByEmail(email);

    if (!user || !user.password_hash) {
      return res.render('auth-login', { layout: false, error: 'No account found with that email. Try signing up.', email });
    }

    // Check lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
      return res.render('auth-login', { layout: false, error: `Account locked after too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, email });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const attempts = await incrementFailedAttempts(user.id);
      if (attempts >= MAX_ATTEMPTS) {
        await lockUser(user.id, new Date(Date.now() + LOCK_DURATION));
        return res.render('auth-login', { layout: false, error: `Too many failed attempts. Account locked for 15 minutes.`, email });
      }
      const remaining = MAX_ATTEMPTS - attempts;
      return res.render('auth-login', { layout: false, error: `Incorrect password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.`, email });
    }

    // Check email verified
    if (!user.email_verified) {
      // Resend OTP and send to verify page
      const otp = generateOtp();
      await setOtp(user.id, otp, new Date(Date.now() + OTP_TTL));
      await sendOtpEmail(user.email, user.name, otp);
      req.session.pendingEmail = user.email;
      return req.session.save(() => res.redirect('/verify-email'));
    }

    // Two-factor authentication — verified password, now require an email code.
    // Reuses the OTP machinery: /verify-email completes the sign-in.
    if (user.two_factor_enabled) {
      const otp = generateOtp();
      await setOtp(user.id, otp, new Date(Date.now() + OTP_TTL));
      await sendOtpEmail(user.email, user.name, otp);
      req.session.pendingEmail = user.email;
      return req.session.save(() => res.redirect('/verify-email'));
    }

    await resetFailedAttempts(user.id);
    await recordLogin(user.id, getIp(req));

    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.name = user.name;
    req.session.provider = user.provider;
    req.session.emailVerified = true;
    req.session.save((err) => {
      if (err) console.error('[login] Session save error:', err.message);
      const redirect = req.query.redirect || '/dashboard';
      res.redirect(redirect);
    });
  }
);

// ─── Page: /signup ────────────────────────────────────────────────────────────

router.get('/signup', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('auth-signup', { layout: false, error: null, email: '', name: '' });
});

router.post('/signup',
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('auth-signup', { layout: false, error: 'Please fill in all fields. Password must be at least 8 characters.', email: req.body.email, name: req.body.name });
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

    const passwordHash = await bcrypt.hash(password, 12);
    const { phone } = req.body;
    const user = await createUser({ email, name, passwordHash, provider: 'credentials' });

    // Save phone if provided
    if (phone && phone.trim()) {
      await setPhone(user.id, phone.trim());
      req.session.pendingPhone = phone.trim();
    }

    // Generate and send OTP
    const otp = generateOtp();
    await setOtp(user.id, otp, new Date(Date.now() + OTP_TTL));
    await sendOtpEmail(email, name, otp);

    // Store pending email in session for the verify page
    req.session.pendingEmail = email;
    req.session.save((err) => {
      if (err) console.error('[signup] Session save error:', err.message);
      res.redirect('/verify-email');
    });
  }
);

// ─── Page: /verify-email (OTP entry) ─────────────────────────────────────────

router.get('/verify-email', (req, res) => {
  const email = req.session.pendingEmail || req.query.email || '';
  if (!email) return res.redirect('/signup');
  res.render('auth-verify-otp', { layout: false, email, error: null });
});

router.post('/verify-email', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.render('auth-verify-otp', { layout: false, email: email || '', error: 'Please enter the 6-digit code.' });
  }

  const user = await findUserByOtp(email, code.trim());
  if (!user) {
    return res.render('auth-verify-otp', { layout: false, email, error: 'Invalid or expired code. Check your email or request a new code.' });
  }

  await markEmailVerified(user.id);
  await clearOtp(user.id);
  await recordLogin(user.id, getIp(req));

  req.session.pendingEmail = null;
  req.session.userId = user.id;
  req.session.email = user.email;
  req.session.name = user.name;
  req.session.provider = 'credentials';
  req.session.emailVerified = true;
  req.session.save((err) => {
    if (err) console.error('[verify-otp] Session save error:', err.message);
    res.redirect('/onboarding');
  });
});

// ─── API: /resend-otp ─────────────────────────────────────────────────────────

router.post('/resend-otp', async (req, res) => {
  const email = req.body.email || req.session.pendingEmail;
  if (!email) return res.status(400).json({ error: 'No email' });

  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.email_verified) return res.json({ ok: true }); // already verified

  const otp = generateOtp();
  await setOtp(user.id, otp, new Date(Date.now() + OTP_TTL));
  await sendOtpEmail(email, user.name, otp);
  res.json({ ok: true });
});


// ─── API: /resend-otp-sms ─────────────────────────────────────────────────────

router.post('/resend-otp-sms', async (req, res) => {
  const email = req.body.email || req.session.pendingEmail;
  const phone = req.session.pendingPhone;
  if (!email) return res.status(400).json({ error: 'No email' });
  if (!phone) return res.status(400).json({ error: 'No phone number on file for this account.' });

  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.email_verified) return res.json({ ok: true });

  const otp = generateOtp();
  await setOtp(user.id, otp, new Date(Date.now() + OTP_TTL));
  try {
    await sendOtpSms(phone, otp);
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] SMS send failed:', err.message);
    res.status(500).json({ error: 'Failed to send SMS. Try email instead.' });
  }
});

// ─── Page: /forgot-password ────────────────────────────────────────────────────

router.get('/forgot-password', (req, res) => {
  res.render('auth-forgot-password', { layout: false, error: null, success: null });
});

router.post('/forgot-password',
  body('email').isEmail().normalizeEmail(),
  async (req, res) => {
    const { email } = req.body;
    const user = await findUserByEmail(email);

    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      await setResetToken(user.id, resetToken, new Date(Date.now() + RESET_TOKEN_TTL));
      const resetUrl = `${process.env.BASE_URL || 'https://hellomaal.com'}/reset-password?token=${resetToken}`;
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0A0F0D;font-family:'DM Sans',system-ui,sans-serif;color:#F0EFE9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0F0D;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0F2E24;border:1px solid rgba(201,168,76,0.15);border-radius:16px;max-width:560px;width:100%;">
        <tr><td style="padding:40px;">
          <p style="margin:0 0 24px;font-size:1.4rem;font-weight:600;color:#C9A84C;">◈ Maal</p>
          <h1 style="margin:0 0 12px;font-size:1.4rem;font-weight:600;">Reset your password</h1>
          <p style="margin:0 0 24px;font-size:0.9rem;color:#8A8D83;line-height:1.6;">Click below to set a new password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#C9A84C;color:#0A0F0D;font-weight:600;padding:0.85rem 2rem;border-radius:8px;text-decoration:none;">Reset Password</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
      sendEmail({ to: email, subject: 'Reset your Maal password', html, text: `Reset your password: ${resetUrl}` })
        .catch(err => console.error('[auth] Reset email failed:', err.message));
    }

    res.render('auth-forgot-password', { layout: false, error: null, success: 'If that email is registered, a reset link is on its way.' });
  }
);

// ─── API: delete account (called from Settings) ───────────────────────────────

router.post('/api/account/delete', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not signed in.' });
  try {
    const { deleteUser } = require('../db/users');
    await deleteUser(req.session.userId);
    req.session.destroy(() => res.json({ ok: true }));
  } catch (err) {
    console.error('Delete account error:', err.message);
    res.status(500).json({ error: 'Failed to delete account.' });
  }
});

// ─── API: logout ───────────────────────────────────────────────────────────────

router.post('/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });
router.get('/logout',  (req, res) => { req.session.destroy(() => res.redirect('/')); });

module.exports = router;
