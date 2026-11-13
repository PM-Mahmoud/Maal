/**
 * Waitlist route — owns: POST /api/waitlist (email signup + confirmation send),
 * GET /api/waitlist/status (is signup invite-only right now?)
 * Does NOT own: user auth, invites (routes/admin.js), any other form submissions
 */
const express = require('express');
const router = express.Router();
const { saveWaitlistEmail } = require('../db/waitlist');
const { sendWaitlistConfirmation } = require('../services/email');
const gate = require('../lib/waitlist-gate');

router.get('/status', (_req, res) => {
  res.json({ gated: gate.isGateOn() });
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  const email = gate.normaliseEmail(body.email);
  if (!email) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
  }
  if (!gate.parseConsent(body.consent)) {
    return res.status(400).json({ ok: false, error: 'Please tick the box so we can email you your invite.' });
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) || null : null;
  const rawScore = Number(body.score);
  const score = Number.isInteger(rawScore) && rawScore >= 0 && rawScore <= 100 ? rawScore : null;

  try {
    const isNew = await saveWaitlistEmail(email, {
      name,
      consent: true,
      source: gate.normaliseSource(body.source),
      score,
    });

    if (!isNew) {
      // Already on list — still OK, just don't re-send the confirmation.
      return res.json({ ok: true, message: 'You’re already on the waitlist.' });
    }

    sendWaitlistConfirmation(email).catch((err) => {
      console.error('[waitlist] Confirmation email failed:', err.message);
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[waitlist] Error:', err.message);
    res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
