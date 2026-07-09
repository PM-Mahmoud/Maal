// db/profiles.js
// Query functions for user_profiles table.

const { pool } = require('./auth');

async function upsertProfile(userId, data) {
  const {
    profession, specialty, years_in_practice, annual_income,
    hecs_balance, super_balance, investment_portfolio, property_value,
    total_debt, cash_savings, monthly_expenses, goals, prefers_halal,
    prefers_esg, has_smsf,
    has_private_health, practice_owner, insurance_cover, retirement_age,
    linked_institutions, onboarding_data, completed_onboarding
  } = data;

  const result = await pool.query(
    `INSERT INTO user_profiles
     (user_id, profession, specialty, years_in_practice, annual_income,
      hecs_balance, super_balance, investment_portfolio, property_value,
      total_debt, cash_savings, monthly_expenses, goals, prefers_halal,
      prefers_esg, has_smsf,
      has_private_health, practice_owner, insurance_cover, retirement_age,
      linked_institutions, onboarding_data, completed_onboarding, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       profession = EXCLUDED.profession,
       specialty = EXCLUDED.specialty,
       years_in_practice = EXCLUDED.years_in_practice,
       annual_income = EXCLUDED.annual_income,
       hecs_balance = EXCLUDED.hecs_balance,
       super_balance = EXCLUDED.super_balance,
       investment_portfolio = EXCLUDED.investment_portfolio,
       property_value = EXCLUDED.property_value,
       total_debt = EXCLUDED.total_debt,
       cash_savings = EXCLUDED.cash_savings,
       monthly_expenses = EXCLUDED.monthly_expenses,
       goals = EXCLUDED.goals,
       prefers_halal = EXCLUDED.prefers_halal,
       prefers_esg = EXCLUDED.prefers_esg,
       has_smsf = EXCLUDED.has_smsf,
       has_private_health = EXCLUDED.has_private_health,
       practice_owner = EXCLUDED.practice_owner,
       insurance_cover = EXCLUDED.insurance_cover,
       retirement_age = EXCLUDED.retirement_age,
       linked_institutions = EXCLUDED.linked_institutions,
       onboarding_data = EXCLUDED.onboarding_data,
       completed_onboarding = EXCLUDED.completed_onboarding,
       updated_at = NOW()
     RETURNING *`,
    [userId, profession||null, specialty||null, years_in_practice||null,
     annual_income||0, hecs_balance||0, super_balance||0,
     investment_portfolio||0, property_value||0, total_debt||0,
     cash_savings||0, monthly_expenses||0,
     goals||[], prefers_halal||false, prefers_esg||false,
     has_smsf||false, has_private_health||false, practice_owner||false,
     insurance_cover||'none', retirement_age||65,
     JSON.stringify(linked_institutions||[]),
     JSON.stringify(onboarding_data||{}),
     completed_onboarding||false]
  );
  return result.rows[0];
}

async function getProfileByUserId(userId) {
  const result = await pool.query(
    `SELECT * FROM user_profiles WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function updateProfile(userId, data) {
  return upsertProfile(userId, data);
}

async function deleteProfile(userId) {
  await pool.query(`DELETE FROM user_profiles WHERE user_id = $1`, [userId]);
}

// ─── React /api/v1/profile support (pure mappers + partial update) ──────────
// The React app models a profile with display_name / age_band / risk — fields
// that have no dedicated user_profiles columns. They live in the onboarding_data
// JSONB; real financial fields stay real columns. These pure helpers are the
// mapping seam between the two, and are deterministically tested.

// Map an age_band bucket (or the legacy years_in_practice proxy) to a numeric age.
function deriveAge(ageBand, row) {
  const map = { 'under-30': 27, '30-39': 35, '40-49': 45, '50-59': 55, '60+': 65 };
  if (ageBand && map[ageBand]) return map[ageBand];
  const years = Number(row && row.years_in_practice);
  if (Number.isFinite(years) && years > 0) return 25 + years; // legacy proxy (matches maal-score)
  return 35;
}

// user_profiles row (+ users row for email) → the flat, React-facing profile object.
function normalizeProfile(row, user) {
  const r = row || {};
  const od = (r.onboarding_data && typeof r.onboarding_data === 'object') ? r.onboarding_data : {};
  const emailName = user && user.email ? String(user.email).split('@')[0] : '';
  const num = (v) => Number(v) || 0;
  return {
    display_name: od.display_name || emailName || '',
    age_band: od.age_band || null,
    risk: od.risk || null,
    age: deriveAge(od.age_band, r),
    annual_income: num(r.annual_income),
    super_balance: num(r.super_balance),
    investment_portfolio: num(r.investment_portfolio),
    property_value: num(r.property_value),
    total_debt: num(r.total_debt),
    cash_savings: num(r.cash_savings),
    hecs_balance: num(r.hecs_balance),
    monthly_expenses: num(r.monthly_expenses),
    retirement_age: num(r.retirement_age) || 67,
    completed_onboarding: !!r.completed_onboarding,
    onboarded: !!r.completed_onboarding, // React alias
    created_at: (user && user.created_at) || null, // account-creation date (dashboard "All" range floor)
  };
}

// A React profile patch → { cols (real columns), onboarding_data (JSON stash) }.
// Only keys actually present in the patch are emitted, so unspecified fields are
// left untouched by patchProfile (real PATCH semantics, not a full overwrite).
function profilePatchToColumns(patch) {
  const p = patch || {};
  const cols = {};
  const onboarding_data = {};
  for (const k of ['display_name', 'age_band', 'risk']) {
    if (k in p) onboarding_data[k] = p[k];
  }
  const numCols = ['annual_income', 'super_balance', 'investment_portfolio', 'property_value',
    'total_debt', 'cash_savings', 'monthly_expenses', 'hecs_balance', 'retirement_age'];
  for (const k of numCols) {
    if (k in p && p[k] !== undefined && p[k] !== null && p[k] !== '') cols[k] = Number(p[k]) || 0;
  }
  if ('onboarded' in p || 'completed_onboarding' in p) {
    cols.completed_onboarding = !!(('onboarded' in p) ? p.onboarded : p.completed_onboarding);
  }
  return { cols, onboarding_data };
}

// Partial update: merges the patch over the current row (preserving unspecified
// columns) and merges onboarding_data, then reuses the tested upsertProfile.
async function patchProfile(userId, patch) {
  const { cols, onboarding_data } = profilePatchToColumns(patch);
  const current = (await getProfileByUserId(userId)) || {};
  const currentOd = (current.onboarding_data && typeof current.onboarding_data === 'object') ? current.onboarding_data : {};
  const merged = {
    ...current,
    ...cols,
    onboarding_data: { ...currentOd, ...onboarding_data },
  };
  return upsertProfile(userId, merged);
}

module.exports = {
  upsertProfile, getProfileByUserId, updateProfile, deleteProfile,
  normalizeProfile, profilePatchToColumns, patchProfile, deriveAge,
};