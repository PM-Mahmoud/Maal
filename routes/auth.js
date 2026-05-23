// routes/auth.js
// Serves /login, /signup, /forgot-password, /verify-email pages and API endpoints.
// Does NOT own Pool — all DB work goes through db/users.js.

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');

const {
  createUser, findUserByEmail, findUserById,
  setVerifyToken, markEmailVerified, findUserByVerifyToken,
  setResetToken, findUserByResetToken, setPasswordHash
} = require('../db/users');

const { sendEmail } = require('../services/email');

const VERIFY_TOKEN_TTL = 24 * 3600 * 1000; // 24 hours
const RESET_TOKEN_TTL = 3600 * 1000; // 1 hour

// ─── Page: /login ─────────────────────────────────────────────────────────────

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('auth-login', { error: null, email: '' });
});

router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('auth-login', {
        error: 'Please enter a valid email and password.',
        email: req.body.email
      });
    }

    const { email, password } = req.body;
    const user = await findUserByEmail(email);

    if (!user || !user.password_hash) {
      return res.render('auth-login', {
        error: 'No account found with that email. Try signing up.',
        email
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.render('auth-login', {
        error: 'Incorrect password. Try again or reset it.',
        email
      });
    }

    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.name = user.name;
    req.session.provider = user.provider;
    req.session.emailVerified = user.email_verified;
    req.session.save(() => {
      res.redirect('/dashboard');
    });
  }
);

// ─── Page: /signup ────────────────────────────────────────────────────────────

router.get('/signup', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('auth-signup', { error: null, email: '', name: '' });
});

router.post('/signup',
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('auth-signup', {
        error: 'Please fill in all fields. Password must be at least 8 characters.',
        email: req.body.email, name: req.body.name
      });
    }

    const { name, email, password } = req.body;
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.render('auth-signup', {
        error: 'An account with this email already exists. Sign in instead.',
        email, name
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const user = await createUser({
      email, name, passwordHash, provider: 'credentials'
    });
    await setVerifyToken(user.id, verifyToken, new Date(Date.now() + VERIFY_TOKEN_TTL));

    // Send verification email
    try {
      const verifyUrl = `${process.env.BASE_URL || 'https://mizan-2.polsia.app'}/verify-email?token=${verifyToken}`;
      const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Verify your Mizan account</title></head>
<body style="margin:0;padding:0;background:#0A0F0D;font-family:'DM Sans',system-ui,sans-serif;color:#F0EFE9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0F0D;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0F2E24;border:1px solid rgba(201,168,76,0.15);border-radius:16px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="padding:40px;">
          <p style="margin:0 0 24px;font-size:1.5rem;font-weight:600;color:#C9A84C;">◈ Mizan</p>
          <h1 style="margin:0 0 16px;font-size:1.5rem;font-weight:600;">Welcome to Mizan, ${name.split(' ')[0]}.</h1>
          <p style="margin:0 0 20px;font-size:0.95rem;color:#8A8D83;line-height:1.7;">
            Click the button below to verify your email address and access your financial health dashboard.
          </p>
          <p style="margin:20px 0;">
            <a href="${verifyUrl}" style="display:inline-block;background:#C9A84C;color:#0A0F0D;font-weight:600;padding:0.85rem 2rem;border-radius:8px;text-decoration:none;font-size:0.95rem;">Verify Email Address</a>
          </p>
          <p style="margin:0;font-size:0.8rem;color:#8A8D83;line-height:1.5;">
            Or copy and paste: ${verifyUrl}<br>
            This link expires in 24 hours.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

      await sendEmail({
        to: email,
        from: 'noreply@mizan-2.polsia.app',
        subject: 'Verify your Mizan account',
        html,
        text: `Welcome to Mizan, ${name}. Click to verify: ${verifyUrl}`
      });
    } catch (err) {
      console.error('Verification email failed:', err.message);
    }

    // Log in immediately (unverified) — they can verify later
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.name = user.name;
    req.session.provider = 'credentials';
    req.session.emailVerified = false;
    req.session.save(() => {
      res.redirect('/onboarding');
    });
  }
);

// ─── Page: /forgot-password ────────────────────────────────────────────────────

router.get('/forgot-password', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('auth-forgot-password', { error: null, success: null });
});

router.post('/forgot-password',
  body('email').isEmail().normalizeEmail(),
  async (req, res) => {
    const { email } = req.body;
    const user = await findUserByEmail(email);

    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      await setResetToken(user.id, resetToken, new Date(Date.now() + RESET_TOKEN_TTL));

      try {
        const resetUrl = `${process.env.BASE_URL || 'https://mizan-2.polsia.app'}/reset-password?token=${resetToken}`;
        const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reset your Mizan password</title></head>
<body style="margin:0;padding:0;background:#0A0F0D;font-family:'DM Sans',system-ui,sans-serif;color:#F0EFE9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0F0D;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0F2E24;border:1px solid rgba(201,168,76,0.15);border-radius:16px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="padding:40px;">
          <p style="margin:0 0 24px;font-size:1.5rem;font-weight:600;color:#C9A84C;">◈ Mizan</p>
          <h1 style="margin:0 0 16px;font-size:1.4rem;font-weight:600;">Reset your password</h1>
          <p style="margin:0 0 20px;font-size:0.95rem;color:#8A8D83;line-height:1.7;">
            Click below to set a new password. This link expires in 1 hour.
          </p>
          <p style="margin:20px 0;">
            <a href="${resetUrl}" style="display:inline-block;background:#C9A84C;color:#0A0F0D;font-weight:600;padding:0.85rem 2rem;border-radius:8px;text-decoration:none;font-size:0.95rem;">Reset Password</a>
          </p>
          <p style="margin:0;font-size:0.8rem;color:#8A8D83;line-height:1.5;">
            Or copy and paste: ${resetUrl}<br>
            If you didn't request this, ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

        await sendEmail({
          to: email,
          from: 'noreply@mizan-2.polsia.app',
          subject: 'Reset your Mizan password',
          html,
          text: `Reset your Mizan password: ${resetUrl}`
        });
      } catch (err) {
        console.error('Reset email failed:', err.message);
      }
    }

    // Always show success to prevent email enumeration
    res.render('auth-forgot-password', {
      error: null,
      success: 'If that email is in our system, we sent a reset link. Check your inbox.'
    });
  }
);

// ─── Page: /verify-email ───────────────────────────────────────────────────────

router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.render('auth-verify-email', { success: false, error: 'Missing token.' });

  const user = await findUserByVerifyToken(token);
  if (!user) {
    return res.render('auth-verify-email', {
      success: false,
      error: 'This link is invalid or expired. Request a new one below.'
    });
  }

  await markEmailVerified(user.id);
  if (req.session.userId === user.id) {
    req.session.emailVerified = true;
  }

  res.render('auth-verify-email', {
    success: true,
    error: null
  });
});

// ─── API: logout ───────────────────────────────────────────────────────────────

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    res.redirect('/');
  });
});

router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    res.redirect('/');
  });
});

module.exports = router;