const pool = require('./pool');

async function loadPerformanceInputs(userId, days) {
  const [snapshots, cashFlows] = await Promise.all([
    pool.query(
      `SELECT snap_date, invest_balance FROM net_worth_snapshots
        WHERE user_id = $1 AND snap_date >= CURRENT_DATE - $2::int
        ORDER BY snap_date`, [userId, days]
    ),
    pool.query(
      `SELECT t.amount, t.post_date AS occurred_on
         FROM transactions t
         JOIN transaction_provider_details d
           ON d.transaction_id = t.id AND d.user_id = t.user_id
         JOIN investments i
           ON i.user_id = t.user_id AND i.account_reference = d.account_reference
        WHERE t.user_id = $1 AND t.status IS DISTINCT FROM 'pending'
          AND t.post_date >= CURRENT_DATE - $2::int
          AND COALESCE(t.description, '') ~* '\\m(transfer|deposit|contribution|withdrawal)\\M'
        ORDER BY t.post_date, t.id`, [userId, days]
    ),
  ]);
  return { snapshots: snapshots.rows, cashFlows: cashFlows.rows };
}

module.exports = { loadPerformanceInputs };
