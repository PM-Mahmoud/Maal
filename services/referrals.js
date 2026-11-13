'use strict';
// services/referrals.js — referral flow glue: invites, sign-ups, payments and
// the Stripe renewal reward. Rules live in lib/referrals.js; queries in
// db/referrals.js. Nothing here ever blocks a sign-up or a payment: failures
// are logged and the main flow continues.

const rules = require('../lib/referrals');
const db = require('../db/referrals');

const RENEWAL_COUPON_ID = 'maal-referral-renewal-' + rules.RENEWAL_DISCOUNT_CENTS;

/** A code from the session/URL that may let someone past the waitlist, or null. */
async function validInvite(rawCode, newEmail) {
  const code = rules.normaliseCode(rawCode);
  if (!code) return null;
  const row = await db.findCode(code);
  if (!rules.inviteAllowed(row, row && row.signups)) return null;
  if (newEmail && rules.isSelfReferral(row.referrer_email, newEmail)) return null;
  return row;
}

/** After an account is created: link it to whoever referred it. */
async function onSignup(req, newUser) {
  const raw = req.session && req.session.referralCode;
  if (!raw || !newUser) return;
  try {
    const row = await validInvite(raw, newUser.email);
    if (row && Number(row.user_id) !== Number(newUser.id)) {
      await db.recordSignup(row.user_id, newUser.id, row.code);
    }
  } catch (e) {
    console.error('[referrals] onSignup failed:', e.message);
  } finally {
    if (req.session) delete req.session.referralCode;
  }
}

async function ensureRenewalCoupon(stripe) {
  try {
    return await stripe.coupons.retrieve(RENEWAL_COUPON_ID);
  } catch (err) {
    if (err && err.statusCode !== 404 && err.code !== 'resource_missing') throw err;
    return stripe.coupons.create({
      id: RENEWAL_COUPON_ID,
      name: 'Referral reward: renew for $4.99',
      amount_off: rules.RENEWAL_DISCOUNT_CENTS,
      currency: 'aud',
      duration: 'once',
    });
  }
}

/** Put a pending reward on the user's active subscription (next renewal). */
async function applyPendingReward(userId, stripe, subscriptionId) {
  if (!stripe) return false;
  const reward = await db.pendingReward(userId);
  if (!reward) return false;
  let subId = subscriptionId;
  if (!subId) {
    const pool = require('../db/pool');
    const { rows } = await pool.query('SELECT stripe_customer_id FROM users WHERE id = $1', [userId]);
    const customer = rows[0] && rows[0].stripe_customer_id;
    if (!customer) return false;
    const subs = await stripe.subscriptions.list({ customer, status: 'active', limit: 1 });
    subId = subs.data[0] && subs.data[0].id;
  }
  if (!subId) return false; // not subscribed yet — applied when they join
  const coupon = await ensureRenewalCoupon(stripe);
  await stripe.subscriptions.update(subId, { discounts: [{ coupon: coupon.id }] });
  await db.markRewardApplied(reward.id, userId, subId);
  console.log(`[referrals] renewal reward applied for user ${userId}`);
  return true;
}

/**
 * A user just paid for the first time. Count it for their referrer, grant a
 * reward at every 3 paid referrals, and apply any reward this user is owed
 * to their own new subscription. Idempotent (webhook + success page both call it).
 */
async function onPaid(userId, stripe, subscriptionId) {
  try {
    const referrerId = await db.markPaid(userId);
    if (referrerId) {
      const s = await db.stats(referrerId);
      if (rules.shouldGrantReward(s.paid, s.rewards, !!s.open_reward)) {
        await db.createReward(referrerId);
        console.log(`[referrals] reward granted to user ${referrerId}`);
        await applyPendingReward(referrerId, stripe);
      }
    }
    await applyPendingReward(userId, stripe, subscriptionId);
  } catch (e) {
    console.error('[referrals] onPaid failed:', e.message);
  }
}

/** A yearly renewal was paid: an applied reward has now been used. */
async function onRenewalPaid(userId) {
  try { await db.markAppliedRewardUsed(userId); }
  catch (e) { console.error('[referrals] onRenewalPaid failed:', e.message); }
}

async function onRefund(userId) {
  try { await db.markRefunded(userId); }
  catch (e) { console.error('[referrals] onRefund failed:', e.message); }
}

/** What the "Invite friends" card shows. */
async function summaryFor(userId, baseUrl) {
  const [code, s] = await Promise.all([db.getOrCreateCode(userId), db.stats(userId)]);
  const p = rules.progress(s.paid, s.rewards);
  return {
    code,
    link: (baseUrl || '').replace(/\/+$/, '') + '/r/' + code,
    signedUp: s.signed_up,
    paid: p.paid,
    towardsNext: p.towardsNext,
    needed: p.needed,
    rewardStatus: s.open_reward || null, // 'pending' | 'applied' | null
  };
}

module.exports = { validInvite, onSignup, onPaid, onRenewalPaid, onRefund, applyPendingReward, summaryFor, RENEWAL_COUPON_ID };
