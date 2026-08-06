const pool = require('./pool');
const goalsDb = require('./goals');
const { getProfileByUserId } = require('./profiles');

async function loadPlanningInputs(userId) {
  const [goals, profile, cash, debts] = await Promise.all([
    goalsDb.listGoals(userId), getProfileByUserId(userId),
    pool.query('SELECT id, label, balance FROM cash_accounts WHERE user_id=$1 ORDER BY id', [userId]),
    pool.query('SELECT id, label, kind, balance, interest_rate, min_payment FROM debts WHERE user_id=$1 ORDER BY id', [userId]),
  ]);
  return { goals, cash: cash.rows.reduce((s,r)=>s+Number(r.balance||0),0), monthlyEssentialExpenses: Number(profile?.monthly_expenses||0), debts: debts.rows };
}
async function savePlan(userId, name, config, summary) {
  const client = await pool.connect();
  try { await client.query('BEGIN');
    let plan;
    if (config.planId) {
      const r = await client.query('UPDATE financial_plans SET name=$3,config=$4,latest_summary=$5,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *',[config.planId,userId,name,config,summary]); plan=r.rows[0];
    } else {
      const r = await client.query('INSERT INTO financial_plans(user_id,name,config,latest_summary) VALUES($1,$2,$3,$4) RETURNING *',[userId,name,config,summary]); plan=r.rows[0];
    }
    if (!plan) throw Object.assign(new Error('Plan not found'), { status: 404 });
    await client.query('INSERT INTO financial_plan_snapshots(plan_id,user_id,summary) VALUES($1,$2,$3)',[plan.id,userId,summary]); await client.query('COMMIT'); return plan;
  } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
async function listPlans(userId) { const r=await pool.query(`SELECT p.*, COALESCE((SELECT json_agg(s ORDER BY s.captured_at) FROM (SELECT id,summary,captured_at FROM financial_plan_snapshots WHERE plan_id=p.id ORDER BY captured_at DESC LIMIT 24) s),'[]') snapshots FROM financial_plans p WHERE p.user_id=$1 ORDER BY p.updated_at DESC`,[userId]); return r.rows; }
module.exports={loadPlanningInputs,savePlan,listPlans};
