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

module.exports = { upsertProfile, getProfileByUserId, updateProfile, deleteProfile };