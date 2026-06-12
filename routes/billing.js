// routes/billing.js
// Subscription checkout via Stripe (test mode).
//
// Works in two modes:
//   1. STRIPE_SECRET_KEY set (sk_test_...)  -> real Stripe Checkout session
//   2. No key                               -> demo mode: simulates a successful
//                                              upgrade so the flow can be tested
//                                              without a Stripe account.
//
// Env vars used:
//   STRIPE_SECRET_KEY  — Stripe secret key (use the sk_test_ one for testing)
//   BASE_URL           — e.g. https://mizan-ufgq.onrender.com

const express = require('express');
const router = express.Router();
const { setUserPlan } = require('../db/users');

const PLANS = {
  pro: { name: 'Mizan Pro', amount: 2000, blurb: 'The full advisor experience' },   // $20.00 AUD
  max: { name: 'Mizan Max', amount: 20000, blurb: 'For complex finances' },         // $200.00 AUD
};

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try {
    return require('stripe')(process.env.STRIPE_SECRET_KEY);
  } catch (err) {
    console.error('Stripe module not installed:', err.message);
    return null;
  }
}

// ─── POST /billing/checkout ──────────────────────────────────────────────────

router.post('/checkout', requireAuth, async (req, res) => {
  const planKey = (req.body.plan || '').toLowerCase();
  const plan = PLANS[planKey];
  if (!plan) return res.redirect('/dashboard/settings');

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const stripe = getStripe();

  // Demo mode — no Stripe key configured. Simulate success and persist the plan.
  if (!stripe) {
    await setUserPlan(req.session.userId, planKey);
    return res.redirect(`/dashboard/settings?billing=demo&plan=${planKey}`);
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: req.session.email || undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'aud',
          unit_amount: plan.amount,
          recurring: { interval: 'month' },
          product_data: {
            name: plan.name,
            description: plan.blurb,
          },
        },
      }],
      success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}&plan=${planKey}`,
      cancel_url: `${baseUrl}/dashboard/settings?billing=cancel`,
      metadata: { userId: String(req.session.userId), plan: planKey },
    });
    return res.redirect(303, session.url);
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    return res.redirect('/dashboard/settings?billing=error');
  }
});

// ─── GET /billing/success — verify the Stripe session, persist the plan ──────

router.get('/success', requireAuth, async (req, res) => {
  const planKey = (req.query.plan || '').toLowerCase();
  const stripe = getStripe();
  try {
    if (stripe && req.query.session_id) {
      const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
      if (session && session.payment_status === 'paid' && PLANS[planKey]) {
        await setUserPlan(req.session.userId, planKey);
        return res.redirect(`/dashboard/settings?billing=success&plan=${planKey}`);
      }
    }
    res.redirect('/dashboard/settings?billing=error');
  } catch (err) {
    console.error('Billing success verify error:', err.message);
    res.redirect('/dashboard/settings?billing=error');
  }
});

// ─── POST /billing/downgrade — back to free (demo-friendly) ──────────────────

router.post('/downgrade', requireAuth, async (req, res) => {
  try {
    await setUserPlan(req.session.userId, 'free');
  } catch (err) {
    console.error('Downgrade error:', err.message);
  }
  res.redirect('/dashboard/settings?billing=downgraded');
});

module.exports = router;
