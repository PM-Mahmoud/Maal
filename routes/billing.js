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

// Plans. Amounts are in CENTS (AUD). Only `member` is for sale
// (lib/membership.js: $4.99 first year, then $49.99/yr). `pro`/`max` stay in
// this table, marked not for sale, so existing subscribers' Stripe sessions
// and webhooks still resolve — they can't be bought any more.
const membership = require('../lib/membership');
const PLANS = {
  member: {
    name: membership.MEMBERSHIP.name,
    blurb: 'Access to AI chat, your Maal Score and every money tool',
    year: membership.MEMBERSHIP.yearCents,                 // $49.99/yr
    firstYearDiscount: membership.FIRST_YEAR_DISCOUNT_CENTS, // → $4.99 first year
    forSale: true,
  },
  pro: { name: 'Maal Pro', blurb: 'Legacy plan', month: 2000, year: 20000, forSale: false },
  max: { name: 'Maal Max', blurb: 'Legacy plan', month: 20000, year: 200000, forSale: false },
};

// Resolve a plan to its Stripe line item, or null if it isn't for sale.
// Membership is yearly only; the interval argument is ignored for it.
function resolvePrice(planKey) {
  const plan = PLANS[planKey];
  if (!plan || !plan.forSale) return null;
  return { plan, interval: 'year', amount: plan.year, discount: plan.firstYearDiscount || 0 };
}

// The first-year offer is a Stripe coupon (a one-time amount off the first
// yearly invoice). Created on first use and reused after; the id is fixed so
// it's idempotent across deploys and instances.
const FIRST_YEAR_COUPON_ID = 'maal-first-year-' + membership.FIRST_YEAR_DISCOUNT_CENTS;
async function ensureFirstYearCoupon(stripe) {
  try {
    return await stripe.coupons.retrieve(FIRST_YEAR_COUPON_ID);
  } catch (err) {
    if (err && err.statusCode !== 404 && err.code !== 'resource_missing') throw err;
    return stripe.coupons.create({
      id: FIRST_YEAR_COUPON_ID,
      name: 'First year: ' + membership.formatAud(membership.MEMBERSHIP.firstYearCents),
      amount_off: membership.FIRST_YEAR_DISCOUNT_CENTS,
      currency: membership.MEMBERSHIP.currency,
      duration: 'once',
    });
  }
}

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

// Demo mode simulates a paid upgrade WITHOUT taking payment. getStripe() also
// returns null when the Stripe module fails to load, so "no stripe" alone is not
// safe to treat as demo — gate it behind an explicit dev/test flag and fail
// closed everywhere else (never grant paid plans for free in production).
function demoModeAllowed() {
  return ['development', 'test'].includes(process.env.NODE_ENV) && process.env.ALLOW_BILLING_DEMO === 'true';
}

router.post('/checkout', requireAuth, async (req, res) => {
  const planKey = (req.body.plan || 'member').toLowerCase();
  const priced = resolvePrice(planKey);
  if (!priced) return res.redirect('/app/billing');
  const { plan, interval, amount, discount } = priced;

  const stripe = getStripe();

  // No Stripe configured → only the explicitly-enabled dev/test demo may grant a plan.
  if (!stripe) {
    if (!demoModeAllowed()) {
      console.warn('[billing] checkout with no Stripe configured and demo mode off — refusing. Set STRIPE_SECRET_KEY in the host env.');
      return res.redirect('/app/billing?billing=error_config');
    }
    await setUserPlan(req.session.userId, planKey);
    return res.redirect(`/app/billing?billing=demo&plan=${planKey}`);
  }

  // Build redirect URLs only from a trusted configured origin — Host/proto are
  // client/proxy-controlled and could redirect Stripe to an attacker origin.
  const baseUrl = (process.env.BASE_URL || '').replace(/\/+$/, '');
  if (!baseUrl) {
    console.error('[billing] BASE_URL not configured — cannot build Stripe redirect URLs. Set BASE_URL (e.g. https://www.hellomaal.com) in the host env.');
    return res.redirect('/app/billing?billing=error_config');
  }

  try {
    // Only new members get the first-year price; someone re-joining after
    // cancelling pays the normal yearly price.
    const { rows: priorRows } = await pool.query('SELECT plan, stripe_customer_id FROM users WHERE id = $1', [req.session.userId]);
    const returning = !!(priorRows[0] && priorRows[0].stripe_customer_id);
    const discounts = discount > 0 && !returning
      ? [{ coupon: (await ensureFirstYearCoupon(stripe)).id }]
      : undefined;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      discounts,
      payment_method_types: ['card'],
      customer_email: req.session.email || undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'aud',
          unit_amount: amount,
          recurring: { interval },
          product_data: {
            name: plan.name,
            description: plan.blurb,
          },
        },
      }],
      success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}&plan=${planKey}`,
      cancel_url: `${baseUrl}/app/billing?billing=cancel`,
      metadata: { userId: String(req.session.userId), plan: planKey, interval },
    });
    // Save Stripe customer ID for webhook lookups
    if (session.customer) {
      pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [session.customer, req.session.userId])
        .catch(err => console.error('[billing] Failed to save stripe_customer_id:', err.message));
    }
    return res.redirect(303, session.url);
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    return res.redirect('/app/billing?billing=error_stripe');
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

// Cancels at PERIOD END, not immediately: the user has already paid for the
// current period, so they keep their paid access until it lapses. Stripe then
// fires customer.subscription.deleted, and the webhook above flips them to free.
//
// Previously this only flipped users.plan and never told Stripe anything, so a
// customer who "downgraded" lost access instantly and kept being charged.
router.post('/downgrade', requireAuth, async (req, res) => {
  const stripe = getStripe();
  try {
    // No Stripe configured (dev/demo): fall back to the old local-only flip.
    if (!stripe) {
      await setUserPlan(req.session.userId, 'free');
      return res.redirect('/app/billing?billing=downgraded');
    }

    const { rows } = await pool.query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [req.session.userId]
    );
    const customerId = rows[0] && rows[0].stripe_customer_id;

    // No Stripe customer on record — nothing to cancel, so just free them.
    if (!customerId) {
      await setUserPlan(req.session.userId, 'free');
      return res.redirect('/app/billing?billing=downgraded');
    }

    const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 10 });
    if (!subs.data.length) {
      await setUserPlan(req.session.userId, 'free');
      return res.redirect('/app/billing?billing=downgraded');
    }

    await Promise.all(subs.data.map(sub =>
      stripe.subscriptions.update(sub.id, { cancel_at_period_end: true })
    ));

    // Deliberately NOT calling setUserPlan here: they keep the plan they paid
    // for until the period ends. The webhook downgrades them when Stripe says so.
    console.log(`[billing] Scheduled cancellation at period end for user ${req.session.userId}`);
    res.redirect('/app/billing?billing=cancel_scheduled');
  } catch (err) {
    // Never report success on failure — the user would believe they had
    // cancelled while the subscription kept billing.
    console.error('Downgrade error:', err.message);
    res.redirect('/app/billing?billing=error');
  }
});

module.exports = router;
// Named exports for the deterministic price tests. The router stays the default
// export so `app.use('/billing', require('./routes/billing'))` is unchanged.
module.exports.PLANS = PLANS;
module.exports.resolvePrice = resolvePrice;
module.exports.FIRST_YEAR_COUPON_ID = FIRST_YEAR_COUPON_ID;
