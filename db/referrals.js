/**
 * DB module — owns: referral_codes, referrals, referral_rewards queries.
 * Does NOT own: reward rules (lib/referrals.js), Stripe (services/referrals.js).
 * Every per-user read filters by user id in the SQL (ownership check).
 */
const pool = require('./pool');
const { generateCode } = require('../lib/referrals');

/** The member's code, creating one on first use (retries on the rare clash). */
async function getOrCreateCode(userId) {
  const existing = await pool.query('SELECT code FROM referral_codes WHERE user_id = $1', [userId]);
  if (existing.rows[0]) return existing.rows[0].code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { rows } = await pool.query(
      `INSERT INTO referral_codes (user_id, code) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING code`,
      [userId, generateCode()]
    );
    if (rows[0]) return rows[0].code;
    // Either this user got a code concurrently, or the random code clashed.
    const again = await pool.query('SELECT code FROM referral_codes WHERE user_id = $1', [userId]);
    if (again.rows[0]) return again.rows[0].code;
  }
  throw new Error('could not allocate a referral code');
}

/** Code row + how many sign-ups it has brought in, or null if unknown. */
async function findCode(code) {
  const { rows } = await pool.query(
    `SELECT c.user_id, c.code, u.email AS referrer_email,
            (SELECT COUNT(*)::int FROM referrals r WHERE r.code = c.code) AS signups
       FROM referral_codes c JOIN users u ON u.id = c.user_id
      WHERE c.code = $1`,
    [code]
  );
  return rows[0] || null;
}

/** Link a new account to its referrer. No-op if already referred. */
async function recordSignup(referrerUserId, referredUserId, code) {
  await pool.query(
    `INSERT INTO referrals (referrer_user_id, referred_user_id, code)
     VALUES ($1, $2, $3) ON CONFLICT (referred_user_id) DO NOTHING`,
    [referrerUserId, referredUserId, code]
  );
}

/** First payment by a referred user → 'paid'. Returns the referrer id if this call changed it. */
async function markPaid(referredUserId) {
  const { rows } = await pool.query(
    `UPDATE referrals SET status = 'paid', paid_at = NOW()
      WHERE referred_user_id = $1 AND status = 'signed_up'
      RETURNING referrer_user_id`,
    [referredUserId]
  );
  return rows[0] ? rows[0].referrer_user_id : null;
}

/** A refunded first payment no longer counts toward a reward. */
async function markRefunded(referredUserId) {
  await pool.query(
    `UPDATE referrals SET status = 'refunded' WHERE referred_user_id = $1 AND status = 'paid'`,
    [referredUserId]
  );
}

async function stats(referrerUserId) {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM referrals WHERE referrer_user_id = $1) AS signed_up,
       (SELECT COUNT(*)::int FROM referrals WHERE referrer_user_id = $1 AND status = 'paid') AS paid,
       (SELECT COUNT(*)::int FROM referral_rewards WHERE referrer_user_id = $1) AS rewards,
       (SELECT status FROM referral_rewards WHERE referrer_user_id = $1 AND status IN ('pending','applied')
         ORDER BY granted_at DESC LIMIT 1) AS open_reward`,
    [referrerUserId]
  );
  return rows[0];
}

async function createReward(referrerUserId) {
  const { rows } = await pool.query(
    `INSERT INTO referral_rewards (referrer_user_id) VALUES ($1) RETURNING id`,
    [referrerUserId]
  );
  return rows[0].id;
}

async function pendingReward(userId) {
  const { rows } = await pool.query(
    `SELECT id FROM referral_rewards WHERE referrer_user_id = $1 AND status = 'pending'
      ORDER BY granted_at ASC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function markRewardApplied(rewardId, userId, subscriptionId) {
  await pool.query(
    `UPDATE referral_rewards SET status = 'applied', applied_at = NOW(), stripe_subscription_id = $3
      WHERE id = $1 AND referrer_user_id = $2 AND status = 'pending'`,
    [rewardId, userId, subscriptionId]
  );
}

/** The renewal the reward discounted has been paid. */
async function markAppliedRewardUsed(userId) {
  await pool.query(
    `UPDATE referral_rewards SET status = 'used', used_at = NOW()
      WHERE referrer_user_id = $1 AND status = 'applied'`,
    [userId]
  );
}

module.exports = {
  getOrCreateCode, findCode, recordSignup, markPaid, markRefunded, stats,
  createReward, pendingReward, markRewardApplied, markAppliedRewardUsed,
};
