const pool = require('./pool');

async function loadPerformanceInputs(userId, days) {
  const [snapshots, canonicalSnapshots, cashFlows, canonicalCashFlows, canonicalCoverage] = await Promise.all([
    pool.query(
      `SELECT snap_date, invest_balance FROM net_worth_snapshots
        WHERE user_id = $1 AND snap_date >= CURRENT_DATE - $2::int
        ORDER BY snap_date`, [userId, days]
    ),
    pool.query(
      `SELECT snap.snap_date, COALESCE(value.invest_balance, 0) AS invest_balance
         FROM net_worth_snapshots snap
         CROSS JOIN LATERAL (
           SELECT SUM(latest.aud_minor * COALESCE(owner.share, 1)) / 100.0 AS invest_balance
             FROM (
               SELECT DISTINCT ON (subject_type, subject_key)
                 subject_type, subject_key,
                 CASE WHEN currency='AUD' THEN amount_minor ELSE presentation_amount_minor END AS aud_minor
                FROM valuations
               WHERE user_id=$1 AND classification='investment'
                 AND as_of < snap.snap_date + INTERVAL '1 day'
                 AND created_at < snap.snap_date + INTERVAL '1 day'
                 AND (currency='AUD' OR presentation_currency='AUD')
                 AND NOT EXISTS (
                   SELECT 1 FROM valuations successor
                    WHERE successor.user_id=valuations.user_id
                      AND successor.supersedes_id=valuations.id
                      AND successor.created_at < snap.snap_date + INTERVAL '1 day'
                 )
               ORDER BY subject_type, subject_key, as_of DESC, created_at DESC, id DESC
             ) latest
             LEFT JOIN LATERAL (
               SELECT SUM(ownership_percent) / 100.0 AS share
                 FROM ownership_interests own
                WHERE own.user_id=$1 AND own.subject_type=latest.subject_type
                  AND own.subject_key=latest.subject_key
                  AND own.effective_from < snap.snap_date + INTERVAL '1 day'
                  AND (own.effective_to IS NULL OR own.effective_to >= snap.snap_date)
             ) owner ON TRUE
         ) value
        WHERE snap.user_id=$1 AND snap.snap_date >= CURRENT_DATE - $2::int
        ORDER BY snap.snap_date`, [userId, days]
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
    pool.query(
      `SELECT t.amount, t.post_date AS occurred_on
         FROM transactions t
         JOIN transaction_provider_details d ON d.transaction_id=t.id AND d.user_id=t.user_id
         JOIN canonical_account_links link ON link.user_id=t.user_id AND link.status='active'
           AND link.provider=split_part(d.account_reference, ':', 1)
           AND link.external_account_id=substring(d.account_reference from position(':' in d.account_reference) + 1)
         JOIN financial_accounts account ON account.id=link.financial_account_id
           AND account.user_id=link.user_id AND account.account_type='brokerage'
        WHERE t.user_id=$1 AND t.status IS DISTINCT FROM 'pending'
          AND t.post_date >= CURRENT_DATE - $2::int
          AND EXISTS (
            SELECT 1 FROM transactions counterpart
            JOIN transaction_provider_details cd ON cd.transaction_id=counterpart.id AND cd.user_id=counterpart.user_id
            LEFT JOIN canonical_account_links cl ON cl.user_id=counterpart.user_id AND cl.status='active'
              AND cl.provider=split_part(cd.account_reference, ':', 1)
              AND cl.external_account_id=substring(cd.account_reference from position(':' in cd.account_reference) + 1)
            LEFT JOIN financial_accounts ca ON ca.id=cl.financial_account_id AND ca.user_id=cl.user_id AND ca.account_type='brokerage'
            WHERE counterpart.user_id=t.user_id AND counterpart.id<>t.id
              AND counterpart.status IS DISTINCT FROM 'pending' AND ca.id IS NULL
              AND ABS(counterpart.amount + t.amount) <= 0.01
              AND ABS(counterpart.post_date - t.post_date) <= 3
          )
        ORDER BY t.post_date, t.id`, [userId, days]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS brokerage_accounts,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM canonical_account_links link
                 WHERE link.user_id=account.user_id AND link.financial_account_id=account.id AND link.status='active'
              ))::int AS flow_linked_accounts
         FROM financial_accounts account
        WHERE account.user_id=$1 AND account.account_type='brokerage'`, [userId]
    ),
  ]);
  const coverage = canonicalCoverage.rows[0] || {};
  return {
    snapshots: snapshots.rows,
    canonicalSnapshots: canonicalSnapshots.rows,
    cashFlows: cashFlows.rows,
    canonicalCashFlows: canonicalCashFlows.rows,
    canonicalCashFlowCoverage: Number(coverage.brokerage_accounts) > 0
      && Number(coverage.brokerage_accounts) === Number(coverage.flow_linked_accounts),
  };
}

module.exports = { loadPerformanceInputs };
