// routes/reset.js
// Serves /reset-password page (token from email link).

const express = require('express');
const router = express.Router();
const { authLimiter } = require('../lib/rate-limiters');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');

const { findUserByResetToken, setPasswordHash } = require('../db/users');

router.get('/reset-password', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/forgot-password');
  const user = await findUserByResetToken(token);
  res.render('auth-reset-password', { layout: false, error: null, success: null, token: user ? token : '' });
});

router.post('/reset-password', authLimiter,
  body('password').isLength({ min: 8 }),
  async (req, res) => {
    const { token, password } = req.body;
    const errors = validationResult(req);
    if (!errors.isEmpty() || !token) {
      return res.render('auth-reset-password', { layout: false,
        error: 'Password must be at least 8 characters.',
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