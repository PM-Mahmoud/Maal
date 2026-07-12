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
//   BASE_URL           — e.g. https://hellomaal.com

const express = require('express');
const router = express.Router();
const { setUserPlan } = require('../db/users');
const pool = require('../db/pool');

const PLANS = {
  pro: { name: 'Maal Pro', amount: 2000, blurb: 'The full advisor experience' },   // $20.00 AUD
  max: { name: 'Maal Max', amount: 20000, blurb: 'For complex finances' },         // $200.00 AUD
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

// ─── POST /billing/webhook — Stripe sends subscription events here ────────────
// IMPORTANT: must use raw body for signature verification (before JSON parser).

router.post('/webhook',
  require('express').raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.warn('[billing] STRIPE_WEBHOOK_SECRET not set — webhook verification skipped');
      return res.json({ received: true });
    }

    const stripe = getStripe();
    if (!stripe) {
      console.warn('[billing] Stripe not configured — ignoring webhook');
      return res.json({ received: true });
    }

    let event;
    try {
      // Debug: log body type + first 100 chars to confirm raw buffer arrives
      const bodyType = Buffer.isBuffer(req.body) ? `Buffer(${req.body.length})` : typeof req.body;
      console.log(`[billing/webhook] body type=${bodyType} sig=${sig ? sig.slice(0,30) : 'MISSING'}`);
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('[billing] Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          if (session.payment_status === 'paid') {
            const userId = session.metadata?.userId;
            const planKey = session.metadata?.plan;
            if (userId && planKey) {
              await setUserPlan(Number(userId), planKey);
              // Also persist customer ID if not already saved
              if (session.customer) {
                await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2 AND (stripe_customer_id IS NULL OR stripe_customer_id != $1)', [session.customer, Number(userId)]);
              }
              console.log(`[billing] Plan '${planKey}' applied to user ${userId} via webhook`);
            }
          }
          break;
        }
        case 'customer.subscription.deleted':
        case 'invoice.payment_failed': {
          // Downgrade to free on cancellation or failed payment
          const customerId = event.data.object.customer;
          if (customerId) {
            const { rows } = await pool.query(
              'SELECT id FROM users WHERE stripe_customer_id = $1',
              [customerId]
            );
            if (rows.length) {
              await setUserPlan(rows[0].id, 'free');
              console.log(`[billing] Downgraded user ${rows[0].id} to free via webhook (${event.type})`);
            }
          }
          break;
        }
        case 'invoice.payment_succeeded': {
          // Renewal — plan stays current, just log
          console.log(`[billing] Invoice paid for customer ${event.data.object.customer}`);
          break;
        }
        default:
          // Unhandled event type — ignore
          break;
      }
    } catch (err) {
      console.error('[billing] Webhook handler error:', err);
      return res.status(500).json({ error: 'Webhook handler failed' });
    }

    res.json({ received: true });
  }
);

// ─── POST /billing/checkout ──────────────────────────────────────────────────

router.post('/checkout', requireAuth, async (req, res) => {
  const planKey = (req.body.plan || '').toLowerCase();
  const plan = PLANS[planKey];
  if (!plan) return res.redirect('/app/billing');

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const stripe = getStripe();

  // Demo mode — no Stripe key configured. Simulate success and persist the plan.
  if (!stripe) {
    await setUserPlan(req.session.userId, planKey);
    return res.redirect(`/app/billing?billing=demo&plan=${planKey}`);
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
      cancel_url: `${baseUrl}/app/billing?billing=cancel`,
      metadata: { userId: String(req.session.userId), plan: planKey },
    });
    // Save Stripe customer ID for webhook lookups
    if (session.customer) {
      pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [session.customer, req.session.userId])
        .catch(err => console.error('[billing] Failed to save stripe_customer_id:', err.message));
    }
    return res.redirect(303, session.url);
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    return res.redirect('/app/billing?billing=error');
  }
});

// ─── GET /billing/success — verify the Stripe session, persist the plan ──────

router.get('/success', requireAuth, async (req, res) => {
  const stripe = getStripe();
  try {
    if (stripe && req.query.session_id) {
      const stripeSession = await stripe.checkout.sessions.retrieve(req.query.session_id);
      // SECURITY: read plan from server-side metadata, never from query param
      const planKey = (stripeSession.metadata && stripeSession.metadata.plan || '').toLowerCase();
      // SECURITY: verify the session belongs to the currently logged-in user
      if (
        stripeSession &&
        stripeSession.payment_status === 'paid' &&
        PLANS[planKey] &&
        stripeSession.metadata &&
        String(stripeSession.metadata.userId) === String(req.session.userId)
      ) {
        await setUserPlan(req.session.userId, planKey);
        return res.redirect(`/app/billing?billing=success&plan=${planKey}`);
      }
    }
    res.redirect('/app/billing?billing=error');
  } catch (err) {
    console.error('Billing success verify error:', err.message);
    res.redirect('/app/billing?billing=error');
  }
});

// ─── POST /billing/downgrade — back to free (demo-friendly) ──────────────────

router.post('/downgrade', requireAuth, async (req, res) => {
  try {
    await setUserPlan(req.session.userId, 'free');
  } catch (err) {
    console.error('Downgrade error:', err.message);
  }
  res.redirect('/app/billing?billing=downgraded');
});

module.exports = router;
