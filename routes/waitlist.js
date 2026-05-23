/**
 * Waitlist route — owns: POST /api/waitlist (email signup + confirmation send)
 * Does NOT own: user auth, subscription management, any other form submissions
 */
const express = require('express');
const router = express.Router();
const { saveWaitlistEmail } = require('../db/waitlist');
const { sendWaitlistConfirmation } = require('../services/email');

router.post('/', async (req, res) => {
  const { email } = req.body || {};

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ ok: false, error: 'Valid email required.' });
  }

  const normalised = email.trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(normalised)) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
  }

  try {
    const isNew = await saveWaitlistEmail(normalised);

    // Send confirmation regardless — idempotent is fine for waitlists
    sendWaitlistConfirmation(email.trim()).catch((err) => {
      console.error('[waitlist] Confirmation email failed:', err.message);
    });

    if (!isNew) {
      // Already on list — still OK, just don't re-confirm
      return res.json({ ok: true, message: 'Already on the waitlist.' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[waitlist] Error:', err.message);
    res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
