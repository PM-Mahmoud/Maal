const pool = require('./pool');

async function loadScenarioBaseline(userId, asOf) {
  const result = await pool.query(`
    SELECT
      COALESCE((SELECT SUM(balance) FROM cash_accounts WHERE user_id=$1),0) cash,
      COALESCE((SELECT SUM(value) FROM investments WHERE user_id=$1),0) investments,
      COALESCE((SELECT SUM(value) FROM properties WHERE user_id=$1),0) property,
      COALESCE((SELECT SUM(balance) FROM super_accounts WHERE user_id=$1),0) super,
      COALESCE((SELECT SUM(value) FROM other_assets WHERE user_id=$1),0) other_assets,
      COALESCE((SELECT SUM(balance) FROM debts WHERE user_id=$1),0) liabilities,
      COALESCE((SELECT SUM(annual_amount) FROM incomes WHERE user_id=$1),0) annual_income,
      COALESCE((SELECT monthly_expenses * 12 FROM user_profiles WHERE user_id=$1),0) annual_expenses
  `, [userId]);
  const row = result.rows[0];
  return Object.fromEntries(Object.entries({ as_of: asOf, ...row }).map(([key, value]) => [key, key === 'as_of' ? value : Number(value || 0)]));
}
async function saveScenario(userId, record) {
  return (await pool.query(
    `INSERT INTO financial_scenarios(user_id,name,baseline,assumptions,result,model_version)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [userId, record.name, record.baseline, record.assumptions, record.result, record.result.model_version]
  )).rows[0];
}
async function listScenarios(userId) { return (await pool.query('SELECT * FROM financial_scenarios WHERE user_id=$1 ORDER BY created_at DESC', [userId])).rows; }
async function getScenario(userId, id) { return (await pool.query('SELECT * FROM financial_scenarios WHERE id=$1 AND user_id=$2', [id, userId])).rows[0] || null; }
module.exports = { loadScenarioBaseline, saveScenario, listScenarios, getScenario };
