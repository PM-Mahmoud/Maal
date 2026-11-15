'use strict';
// db/risk-profile.js — risk assessment storage in user_profiles.onboarding_data.
//
// No new table: the record lives at onboarding_data.risk_profile, and the band
// is mirrored to onboarding_data.risk (the field /api/v1/profile already exposes
// and the portfolio plan reads) and onboarding_data.risk_tolerance (advisor prompt). Every statement is scoped by user_id in SQL.

function createRiskProfileDb(pool = require('./pool')) {
  async function getRiskProfile(userId) {
    const { rows } = await pool.query(
      `SELECT onboarding_data -> 'risk_profile' AS risk_profile,
              onboarding_data ->> 'age_band'    AS age_band
         FROM user_profiles WHERE user_id = $1`,
      [userId]
    );
    const row = rows[0] || {};
    return { riskProfile: row.risk_profile || null, ageBand: row.age_band || null };
  }

  // Merge { risk_profile, risk } into onboarding_data (creating the profile
  // row if the user has none yet). Other onboarding_data keys are untouched.
  async function saveRiskProfile(userId, record) {
    // risk → /api/v1/profile + portfolio plan; risk_tolerance → the advisor's
    // system prompt and the legacy onboarding wizard (which spell it high_growth).
    const patch = JSON.stringify({
      risk_profile: record,
      risk: record.profile,
      risk_tolerance: String(record.profile).replace('-', '_'),
    });
    const { rows } = await pool.query(
      `INSERT INTO user_profiles (user_id, onboarding_data, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET onboarding_data = COALESCE(user_profiles.onboarding_data, '{}'::jsonb) || $2::jsonb,
             updated_at = NOW()
       RETURNING onboarding_data -> 'risk_profile' AS risk_profile`,
      [userId, patch]
    );
    return rows[0] ? rows[0].risk_profile : null;
  }

  return { getRiskProfile, saveRiskProfile };
}

module.exports = createRiskProfileDb();
module.exports.createRiskProfileDb = createRiskProfileDb;
