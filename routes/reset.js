// routes/reset.js
// Serves /reset-password page (token from email link).

const express = require('express');
const router = express.Router();
const { authLimiter } = require('../lib/rate-limiters');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');

const { findUserByResetToken, setPasswordHash } = require('../db/users');
const { passwordStrengthError } = require('../lib/password-rules');

router.get('/reset-password', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/forgot-password');
  const user = await findUserByResetToken(token);
  res.render('auth-reset-password', { layout: false, error: null, success: null, token: user ? token : '' });
});

router.post('/reset-password', authLimiter,
  body('password').isString(),
  async (req, res) => {
    const { token, password } = req.body;
    const errors = validationResult(req);
    // Same rules as sign-up (lib/password-rules.js), so a reset can't set a
    // password that sign-up would reject.
    const strengthError = errors.isEmpty() ? passwordStrengthError(password) : 'Please enter a new password.';
    if (strengthError || !token) {
      return res.render('auth-reset-password', { layout: false,
        error: strengthError || 'This link is invalid or expired.',
        success: null,
        token
      });
    }

    const user = await findUserByResetToken(token);
    if (!user) {
      return res.render('auth-reset-password', { layout: false,
        error: 'This link is invalid or expired.',
        success: null,
        token: ''
      });
    }

    const hash = await bcrypt.hash(password, 12);
    await setPasswordHash(user.id, hash);

    res.render('auth-reset-password', { layout: false,
      error: null,
      success: true,
      token: ''
    });
  }
);

module.exports = router;