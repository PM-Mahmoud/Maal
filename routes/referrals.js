/**
 * Referrals route — owns: GET /r/:code (referral link landing),
 * GET /api/v1/referrals (the member's link + progress).
 * Does NOT own: reward rules (lib/referrals.js), Stripe (services/referrals.js).
 */
const express = require('express');
const router = express.Router();
const { authLimiter } = require('../lib/rate-limiters');
const referrals = require('../services/referrals');
const { appUrl } = require('../lib/app-host');

// A friend opens a member's link. Valid code → remember it in the session and
// send them to sign-up (where it acts as their invite). Unknown or used-up
// code → the waitlist, so a bad link never dead-ends.
router.get('/r/:code', authLimiter, async (req, res) => {
  try {
    if (req.session.userId) return res.redirect(appUrl('/'));
    const invite = await referrals.validInvite(req.params.code);
    if (!invite) return res.redirect('/waitlist?src=referral');
    req.session.referralCode = invite.code;
    req.session.save(() => res.redirect('/signup?ref=1'));
  } catch (e) {
    console.error('[referrals] /r error:', e.message);
    res.redirect('/waitlist');
  }
});

router.get('/api/v1/referrals', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    res.json(await referrals.summaryFor(req.session.userId, baseUrl));
  } catch (e) {
    console.error('/api/v1/referrals error:', e.message);
    res.status(500).json({ error: 'Could not load your referral link.' });
  }
});

module.exports = router;
