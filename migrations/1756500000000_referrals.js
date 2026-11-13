/**
 * Migration: referrals
 *
 * "Refer 3 friends, renew for $4.99" (specs/onboarding-v2-membership.md, PR 2).
 * Three new tables; the protected `users` table is only referenced by foreign
 * keys, never altered.
 *
 *  referral_codes   — one personal code per member (their /r/<code> link)
 *  referrals        — who signed up through whose link, and whether they paid
 *  referral_rewards — earned renewal discounts: pending → applied → used
 */
module.exports = {
  name: 'referrals',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS referral_codes (
        user_id    BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        code       VARCHAR(16) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id               BIGSERIAL PRIMARY KEY,
        referrer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        referred_user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        code             VARCHAR(16) NOT NULL,
        status           VARCHAR(16) NOT NULL DEFAULT 'signed_up'
                           CHECK (status IN ('signed_up', 'paid', 'refunded')),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        paid_at          TIMESTAMPTZ,
        CHECK (referrer_user_id <> referred_user_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_user_id, status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS referrals_code_idx ON referrals (code)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS referral_rewards (
        id                     BIGSERIAL PRIMARY KEY,
        referrer_user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status                 VARCHAR(16) NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'applied', 'used')),
        stripe_subscription_id TEXT,
        granted_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        applied_at             TIMESTAMPTZ,
        used_at                TIMESTAMPTZ
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS referral_rewards_user_idx ON referral_rewards (referrer_user_id, status)`);
  },
};
