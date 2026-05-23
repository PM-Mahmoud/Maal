/**
 * Migration: user_profiles
 *
 * Creates user_profiles table — one row per user, upserted on onboarding.
 * Stores all financial profile data gathered during the onboarding wizard.
 */
module.exports = {
  name: 'user_profiles',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id                    SERIAL PRIMARY KEY,
        user_id               INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        profession            VARCHAR(255),
        specialty             VARCHAR(255),
        years_in_practice     INTEGER,
        annual_income         NUMERIC DEFAULT 0,
        hecs_balance          NUMERIC DEFAULT 0,
        super_balance         NUMERIC DEFAULT 0,
        investment_portfolio  NUMERIC DEFAULT 0,
        property_value        NUMERIC DEFAULT 0,
        total_debt            NUMERIC DEFAULT 0,
        goals                 TEXT[]  DEFAULT '{}',
        prefers_halal         BOOLEAN DEFAULT false,
        prefers_esg           BOOLEAN DEFAULT false,
        has_smsf              BOOLEAN DEFAULT false,
        has_private_health    BOOLEAN DEFAULT false,
        practice_owner        BOOLEAN DEFAULT false,
        insurance_cover       VARCHAR(20) DEFAULT 'none',
        retirement_age        INTEGER DEFAULT 65,
        linked_institutions   TEXT,
        onboarding_data       JSONB DEFAULT '{}',
        completed_onboarding  BOOLEAN DEFAULT false,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS user_profiles_user_id_idx ON user_profiles (user_id)
    `);
  },
};
