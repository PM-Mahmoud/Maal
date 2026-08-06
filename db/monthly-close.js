const pool = require('./pool');
async function findMonthlyClose(userId, month) {
  return (await pool.query(`SELECT id, to_char(close_month,'YYYY-MM') AS month, payload, payload_hash, created_at FROM monthly_financial_closes WHERE user_id=$1 AND close_month=$2::date`, [userId, `${month}-01`])).rows[0] || null;
}
async function loadMonthlyCloseInputs(userId, month) {
  const start = `${month}-01`;
  const [snapshots, transactions, reconciliations, investmentCashFlows] = await Promise.all([
    pool.query(`SELECT * FROM net_worth_snapshots WHERE user_id=$1 AND snap_date >= $2::date AND snap_date < $2::date + INTERVAL '1 month' ORDER BY snap_date`, [userId, start]),
    pool.query(`SELECT amount, post_date FROM transactions WHERE user_id=$1 AND post_date >= $2::date AND post_date < $2::date + INTERVAL '1 month' AND status IS DISTINCT FROM 'pending' ORDER BY post_date,id`, [userId, start]),
    pool.query(`SELECT status FROM account_reconciliations WHERE user_id=$1`, [userId]),
    pool.query(`SELECT t.amount, t.post_date AS occurred_on FROM transactions t
      JOIN transaction_provider_details d ON d.transaction_id=t.id AND d.user_id=t.user_id
      JOIN investments i ON i.user_id=t.user_id AND i.account_reference=d.account_reference
      WHERE t.user_id=$1 AND t.post_date >= $2::date AND t.post_date < $2::date + INTERVAL '1 month'
        AND t.status IS DISTINCT FROM 'pending' AND EXISTS (
          SELECT 1 FROM transactions counterpart
          JOIN transaction_provider_details cd ON cd.transaction_id=counterpart.id AND cd.user_id=counterpart.user_id
          LEFT JOIN investments ci ON ci.user_id=counterpart.user_id AND ci.account_reference=cd.account_reference
          WHERE counterpart.user_id=t.user_id AND counterpart.id<>t.id AND ci.id IS NULL
            AND cd.account_reference<>d.account_reference AND ABS(counterpart.amount+t.amount)<=0.01
            AND ABS(counterpart.post_date-t.post_date)<=3
        ) ORDER BY t.post_date,t.id`, [userId, start]),
  ]);
  return { snapshots: snapshots.rows, transactions: transactions.rows, reconciliations: reconciliations.rows, investmentCashFlows: investmentCashFlows.rows };
}
async function storeMonthlyClose(userId, month, payload, hash) {
  return (await pool.query(`INSERT INTO monthly_financial_closes(user_id,close_month,payload,payload_hash) VALUES($1,$2::date,$3,$4) ON CONFLICT(user_id,close_month) DO NOTHING RETURNING id,to_char(close_month,'YYYY-MM') AS month,payload,payload_hash,created_at`, [userId, `${month}-01`, payload, hash])).rows[0] || findMonthlyClose(userId, month);
}
async function listMonthlyCloses(userId) { return (await pool.query(`SELECT id,to_char(close_month,'YYYY-MM') AS month,payload,payload_hash,created_at FROM monthly_financial_closes WHERE user_id=$1 ORDER BY close_month DESC`, [userId])).rows; }
module.exports = { findMonthlyClose, loadMonthlyCloseInputs, storeMonthlyClose, listMonthlyCloses };
