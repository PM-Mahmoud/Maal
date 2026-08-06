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
            difference, status, transaction_count, anchor_transaction_id, tolerance,
            adjustment_total, adjusted_balance, latest_adjustment_id, checked_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
         ON CONFLICT (user_id, account_reference) DO UPDATE SET
           provider_balance = EXCLUDED.provider_balance,
           calculated_balance = EXCLUDED.calculated_balance,
           difference = EXCLUDED.difference, status = EXCLUDED.status,
           transaction_count = EXCLUDED.transaction_count,
           anchor_transaction_id = EXCLUDED.anchor_transaction_id,
           tolerance = EXCLUDED.tolerance,
           adjustment_total = EXCLUDED.adjustment_total,
           adjusted_balance = EXCLUDED.adjusted_balance,
           latest_adjustment_id = EXCLUDED.latest_adjustment_id, checked_at = NOW()`,
        [
          userId, row.account_reference, row.provider_balance, row.calculated_balance,
          row.difference, row.status, row.transaction_count, row.anchor_transaction_id, tolerance,
          row.adjustment_total || 0, row.adjusted_balance, row.latest_adjustment_id,
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
            status, transaction_count, tolerance, adjustment_total, adjusted_balance,
            latest_adjustment_id, checked_at
       FROM account_reconciliations WHERE user_id = $1
       ORDER BY CASE status WHEN 'mismatch' THEN 1 WHEN 'insufficient_data' THEN 2 ELSE 3 END,
                account_reference`,
    [userId]
  );
  return rows;
}

async function listAdjustments(userId, accountReference = null) {
  const { rows } = await pool.query(
    `SELECT id, account_reference, amount, reason, effective_at, created_at
       FROM account_reconciliation_adjustments
      WHERE user_id = $1 AND ($2::text IS NULL OR account_reference = $2)
      ORDER BY effective_at, id`, [userId, accountReference]
  );
  return rows;
}

async function createAdjustment(userId, { accountReference, amount, reason, effectiveAt }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reconciliation = await client.query(
      `SELECT calculated_balance FROM account_reconciliations
        WHERE user_id = $1 AND account_reference = $2
          AND (status = 'mismatch' OR adjustment_total <> 0)
        FOR UPDATE`, [userId, accountReference]
    );
    if (!reconciliation.rows[0] || reconciliation.rows[0].calculated_balance === null) {
      const error = new Error('Account does not have a reconcilable mismatch.');
      error.code = 'RECONCILIATION_NOT_FOUND';
      throw error;
    }
    const inserted = await client.query(
      `INSERT INTO account_reconciliation_adjustments
         (user_id, account_reference, amount, reason, effective_at)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, account_reference, amount, reason, effective_at, created_at`,
      [userId, accountReference, amount, reason, effectiveAt]
    );
    const totals = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, MAX(id) AS latest_id
         FROM account_reconciliation_adjustments
        WHERE user_id = $1 AND account_reference = $2`, [userId, accountReference]
    );
    await client.query(
      `UPDATE account_reconciliations SET adjustment_total = $3,
         adjusted_balance = calculated_balance + $3,
         difference = provider_balance - (calculated_balance + $3),
         status = CASE WHEN ABS(provider_balance - (calculated_balance + $3)) <= tolerance
                       THEN 'matched' ELSE 'mismatch' END,
         latest_adjustment_id = $4, checked_at = NOW()
       WHERE user_id = $1 AND account_reference = $2`,
      [userId, accountReference, totals.rows[0].total, totals.rows[0].latest_id]
    );
    await client.query('COMMIT');
    return inserted.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

module.exports = { loadReconciliationInputs, saveReconciliations, listReconciliations, listAdjustments, createAdjustment };
