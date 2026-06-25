// db/recommended-tools.js
// Query functions for the recommended_tools table.
// Does NOT own Pool — uses shared pool from db/auth.js.
// Owns: fetching and filtering tool recommendations.
// Does NOT own: subscription tier logic, profile normalisation (done in caller).

const { pool } = require('./auth');

/**
 * Fetch tools relevant to a user based on their tier and profile.
 *
 * Tier mapping (mirrors subscription_plan field on users table):
 *   null / 'free' → 'basic' access
 *   any paying plan → 'pro' access
 *   named elite plan → 'elite' access
 *
 * @param {object} opts
 * @param {string} opts.tier        - 'basic' | 'pro' | 'elite'
 * @param {boolean} opts.prefersHalal
 * @param {boolean} opts.hasSmsf
 * @param {boolean} opts.hasProperty  - has property_value > 0
 * @param {string} [opts.region]    - 'AU' | 'UK' | 'Global' | null (no filter)
 * @returns {Promise<object[]>}
 */
async function getToolsForUser({ tier = 'basic', prefersHalal = false, hasSmsf = false, hasProperty = false, region = null }) {
  // Determine which tier_access values this user qualifies for
  // basic → sees 'basic' + 'all'
  // pro   → sees 'basic' + 'pro' + 'all'
  // elite → sees everything
  const accessSet = buildAccessSet(tier);

  // Build profile tag filter — tools must match at least one tag OR have no tags
  const profileTags = buildProfileTags({ hasSmsf, hasProperty });

  const result = await pool.query(
    `SELECT *
     FROM recommended_tools
     WHERE active = true
       AND (
         -- always_show tools bypass tier/profile gating
         always_show = true
         OR (
           tier_access = ANY($1::text[])
           AND (
             profile_tags = '{}'
             OR profile_tags && $2::text[]
           )
         )
       )
     ORDER BY
       -- Screening tools always first
       CASE WHEN category = 'Screening' THEN 0 ELSE 1 END,
       -- halal_relevant column retained for DB compat; ordering by it is a no-op (prefersHalal always false)
       CASE WHEN $3 AND halal_relevant = true THEN 0 ELSE 1 END,
       -- AU region first
       CASE WHEN region = 'AU' THEN 0 WHEN region = 'Global' THEN 1 ELSE 2 END,
       display_order ASC`,
    [accessSet, profileTags.length ? profileTags : ['__none__'], prefersHalal]
  );

  return result.rows;
}

/** All tools — admin/debug only. TODO: verify unused — not called from any live route */
async function getAllTools() {
  const result = await pool.query(
    `SELECT * FROM recommended_tools ORDER BY display_order ASC`
  );
  return result.rows;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAccessSet(tier) {
  const base = ['all', 'basic'];
  if (tier === 'pro' || tier === 'elite') base.push('pro');
  if (tier === 'elite') base.push('elite');
  return base;
}

function buildProfileTags({ hasSmsf, hasProperty }) {
  const tags = ['general'];
  if (hasSmsf) tags.push('smsf');
  if (!hasSmsf) tags.push('non_smsf');
  if (hasProperty) tags.push('property_investor');
  return tags;
}

/**
 * Derive the tier string from a users row.
 * Mirrors the tiers described in the product (Basic/Pro/Elite).
 * Subscription_plan is set by Polsia when a user subscribes via Stripe.
 */
function tierFromUser(user) {
  if (!user) return 'basic';
  const plan = (user.subscription_plan || '').toLowerCase();
  const status = (user.subscription_status || '').toLowerCase();
  if (status !== 'active' && status !== 'trialing') return 'basic';
  if (plan.includes('elite')) return 'elite';
  if (plan.includes('pro') || plan.includes('paid') || plan.includes('premium')) return 'pro';
  // Any active subscription = at least pro
  if (status === 'active' || status === 'trialing') return 'pro';
  return 'basic';
}

module.exports = { getToolsForUser, getAllTools, tierFromUser };
