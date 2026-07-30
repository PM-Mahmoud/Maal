const pool = require('./pool');

async function loadReconciliationInputs(userId) {
  const [accounts, transactions] = await Promise.all([
    pool.query(
      `SELECT account_reference, balance FROM linked_accounts
        WHERE user_id = $1 AND account_reference LIKE 'basiq:%'`,
      [userId]
    ),
    pool.query(
      `SELECT d.account_reference, t.id AS transaction_id, t.amount, t.post_date,
              d.balance_after, d.provider_posted_at
         FROM transaction_provider_details d
         JOIN transactions t ON t.id = d.transaction_id AND t.user_id = d.user_id
        WHERE d.user_id = $1 AND t.status IS DISTINCT FROM 'pending'
        ORDER BY d.account_reference, d.provider_posted_at NULLS LAST, t.post_date, t.id`,
      [userId]
    ),
  ]);
  return { accounts: accounts.rows, transactions: transactions.rows };
}

async function saveReconciliations(userId, results, tolerance = 0.01) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const references = results.map((row) => row.account_reference);
    await client.query(
      `DELETE FROM account_reconciliations
        WHERE user_id = $1 AND NOT (account_reference = ANY($2::text[]))`,
      [userId, references]
    );
    for (const row of results) {
      await client.query(
        `INSERT INTO account_reconciliations
           (user_id, account_reference, provider_balance, calculated_balance,
            difference, status, transaction_count, anchor_transaction_id, tolerance, checked_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
         ON CONFLICT (user_id, account_reference) DO UPDATE SET
           provider_balance = EXCLUDED.provider_balance,
           calculated_balance = EXCLUDED.calculated_balance,
           difference = EXCLUDED.difference, status = EXCLUDED.status,
           transaction_count = EXCLUDED.transaction_count,
           anchor_transaction_id = EXCLUDED.anchor_transaction_id,
           tolerance = EXCLUDED.tolerance, checked_at = NOW()`,
        [
          userId, row.account_reference, row.provider_balance, row.calculated_balance,
          row.difference, row.status, row.transaction_count, row.anchor_transaction_id, tolerance,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listReconciliations(userId) {
  const { rows } = await pool.query(
    `SELECT account_reference, provider_balance, calculated_balance, difference,
            status, transaction_count, tolerance, checked_at
       FROM account_reconciliations WHERE user_id = $1
       ORDER BY CASE status WHEN 'mismatch' THEN 1 WHEN 'insufficient_data' THEN 2 ELSE 3 END,
                account_reference`,
    [userId]
  );
  return rows;
}

module.exports = { loadReconciliationInputs, saveReconciliations, listReconciliations };
