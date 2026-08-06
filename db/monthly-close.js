const pool = require('./pool');
async function findMonthlyClose(userId, month) {
  return (await pool.query(`SELECT id, to_char(close_month,'YYYY-MM') AS month, payload, payload_hash, created_at FROM monthly_financial_closes WHERE user_id=$1 AND close_month=$2::date`, [userId, `${month}-01`])).rows[0] || null;
}
async function loadMonthlyCloseInputs(userId, month) {
  const start = `${month}-01`;
  const [snapshots, transactions, reconciliations] = await Promise.all([
    pool.query(`SELECT * FROM net_worth_snapshots WHERE user_id=$1 AND snap_date >= $2::date AND snap_date < $2::date + INTERVAL '1 month' ORDER BY snap_date`, [userId, start]),
    pool.query(`SELECT amount, post_date FROM transactions WHERE user_id=$1 AND post_date >= $2::date AND post_date < $2::date + INTERVAL '1 month' AND status IS DISTINCT FROM 'pending' ORDER BY post_date,id`, [userId, start]),
    pool.query(`SELECT status FROM account_reconciliations WHERE user_id=$1`, [userId]),
  ]);
  return { snapshots: snapshots.rows, transactions: transactions.rows, reconciliations: reconciliations.rows };
}
async function storeMonthlyClose(userId, month, payload, hash) {
  return (await pool.query(`INSERT INTO monthly_financial_closes(user_id,close_month,payload,payload_hash) VALUES($1,$2::date,$3,$4) ON CONFLICT(user_id,close_month) DO NOTHING RETURNING id,to_char(close_month,'YYYY-MM') AS month,payload,payload_hash,created_at`, [userId, `${month}-01`, payload, hash])).rows[0] || findMonthlyClose(userId, month);
}
async function listMonthlyCloses(userId) { return (await pool.query(`SELECT id,to_char(close_month,'YYYY-MM') AS month,payload,payload_hash,created_at FROM monthly_financial_closes WHERE user_id=$1 ORDER BY close_month DESC`, [userId])).rows; }
module.exports = { findMonthlyClose, loadMonthlyCloseInputs, storeMonthlyClose, listMonthlyCloses };
