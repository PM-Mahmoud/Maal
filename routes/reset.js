// routes/reset.js
// Serves /reset-password page (token from email link).

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');

const { findUserByResetToken, setPasswordHash } = require('../db/users');

router.get('/reset-password', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/forgot-password');
  const user = await findUserByResetToken(token);
  res.render('auth-reset-password', { error: null, token: user ? token : '' });
});

router.post('/reset-password',
  body('password').isLength({ min: 8 }),
  async (req, res) => {
    const { token, password } = req.body;
    const errors = validationResult(req);
    if (!errors.isEmpty() || !token) {
      return res.render('auth-reset-password', {
        error: 'Password must be at least 8 characters.',
        token
      });
    }

    const user = await findUserByResetToken(token);
    if (!user) {
      return res.render('auth-reset-password', {
        error: 'This link is invalid or expired.',
        token: ''
      });
    }

    const hash = await bcrypt.hash(password, 12);
    await setPasswordHash(user.id, hash);

    res.render('auth-reset-password', {
      error: null,
      success: true
    });
  }
);

module.exports = router;