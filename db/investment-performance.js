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
          AND EXISTS (
            SELECT 1
              FROM transactions counterpart
              JOIN transaction_provider_details counterpart_detail
                ON counterpart_detail.transaction_id = counterpart.id
               AND counterpart_detail.user_id = counterpart.user_id
              LEFT JOIN investments counterpart_investment
                ON counterpart_investment.user_id = counterpart.user_id
               AND counterpart_investment.account_reference = counterpart_detail.account_reference
             WHERE counterpart.user_id = t.user_id AND counterpart.id <> t.id
               AND counterpart.status IS DISTINCT FROM 'pending'
               AND counterpart_detail.account_reference <> d.account_reference
               AND counterpart_investment.id IS NULL
               AND ABS(counterpart.amount + t.amount) <= 0.01
               AND ABS(counterpart.post_date - t.post_date) <= 3
          )
        ORDER BY t.post_date, t.id`, [userId, days]
    ),
  ]);
  return { snapshots: snapshots.rows, cashFlows: cashFlows.rows };
}

module.exports = { loadPerformanceInputs };
