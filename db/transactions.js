// db/transactions.js
// Basiq transactions persisted at sync time (see routes/basiq.js).

const { pool } = require('./auth');
const { mapBasiqTransaction } = require('../lib/basiq-mapping');

async function upsertBasiqTransactions(userId, txns) {
  const client = await pool.connect();
  let saved = 0;
  try {
    await client.query('BEGIN');
    for (const raw of txns) {
      const t = mapBasiqTransaction(raw);
      if (!t) continue;
      await client.query(
        `INSERT INTO transactions (user_id, basiq_id, description, amount, status, post_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (basiq_id) DO UPDATE
           SET description = EXCLUDED.description,
               amount = EXCLUDED.amount,
               status = EXCLUDED.status,
               post_date = EXCLUDED.post_date`,
        [userId, t.basiq_id, t.description, t.amount, t.status, t.post_date]
      );
      saved++;
    }
    await client.query('COMMIT');
    return saved;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getRecentTransactions(userId, limit = 10) {
  const result = await pool.query(
    `SELECT description, amount, status, post_date
     FROM transactions
     WHERE user_id = $1
     ORDER BY post_date DESC NULLS LAST, id DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

// Signed amounts + dates for charting cash flow (in/out) over a window.
async function getTxnsSince(userId, days = 400, limit = 1000) {
  const result = await pool.query(
    `SELECT post_date, amount
       FROM transactions
       WHERE user_id = $1 AND post_date >= CURRENT_DATE - $2::int
       ORDER BY post_date ASC
       LIMIT $3`,
    [userId, days, limit]
  );
  return result.rows;
}

async function getTransactionsForQuality(userId) {
  const result = await pool.query(
    `SELECT id, basiq_id, amount, post_date
       FROM transactions
      WHERE user_id = $1
      ORDER BY id DESC`,
    [userId]
  );
  return result.rows;
}

// ─── Categories + rules (PR 6) ────────────────────────────────────────────
// Categories live in transaction_categories (FK to transactions) so the
// protected transactions table is never altered. All scoped by user_id.

// Transactions joined with their assigned category, newest first.
async function getTransactionsWithCategory(userId, limit = 500) {
  const r = await pool.query(
    `SELECT t.id, t.description, t.amount, t.status, t.post_date,
            c.category_group, c.category, c.source AS category_source
       FROM transactions t
       LEFT JOIN transaction_categories c ON c.transaction_id = t.id
      WHERE t.user_id = $1
      ORDER BY t.post_date DESC NULLS LAST, t.id DESC
      LIMIT $2`,
    [userId, limit]
  );
  return r.rows;
}

// Signed amounts + description for subscription detection over a window.
async function getTxnsForSubscriptions(userId, days = 400, limit = 2000) {
  const r = await pool.query(
    `SELECT id, description, amount, post_date
       FROM transactions
      WHERE user_id = $1 AND post_date >= CURRENT_DATE - $2::int
      ORDER BY post_date ASC
      LIMIT $3`,
    [userId, days, limit]
  );
  return r.rows;
}

async function listRules(userId) {
  const r = await pool.query(
    `SELECT id, name, match_type, match_text, category_group, category, created_at
       FROM transaction_rules WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  );
  return r.rows;
}

async function createRule(userId, { name, match_type, match_text, category_group, category }) {
  const r = await pool.query(
    `INSERT INTO transaction_rules (user_id, name, match_type, match_text, category_group, category)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, (name || '').slice(0, 80) || null, match_type || 'contains', String(match_text || '').slice(0, 120), category_group, category || null]
  );
  return r.rows[0].id;
}

async function deleteRule(id, userId) {
  await pool.query(`DELETE FROM transaction_rules WHERE id = $1 AND user_id = $2`, [id, userId]);
}

// Upsert one transaction's category (ownership enforced via the transactions row).
async function setTransactionCategory(userId, transactionId, group, category, source = 'manual') {
  const owns = await pool.query(`SELECT 1 FROM transactions WHERE id = $1 AND user_id = $2`, [transactionId, userId]);
  if (!owns.rows.length) return false;
  await pool.query(
    `INSERT INTO transaction_categories (transaction_id, user_id, category_group, category, source, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (transaction_id)
     DO UPDATE SET category_group = EXCLUDED.category_group, category = EXCLUDED.category, source = EXCLUDED.source, updated_at = NOW()`,
    [transactionId, userId, group, category || null, source]
  );
  return true;
}

// Bulk-apply computed assignments (from the rules engine) in a SINGLE upsert.
// The assignments come from the user's own transactions (the apply handler reads
// them via getTransactionsWithCategory scoped by user_id), and the INSERT filters
// to transactions owned by the user, so no per-row ownership lookup is needed
// here (that check stays in the single-row setTransactionCategory helper).
async function applyCategoryAssignments(userId, assignments) {
  if (!assignments.length) return 0;
  const ids = assignments.map((a) => a.transaction_id);
  const groups = assignments.map((a) => a.category_group);
  const cats = assignments.map((a) => a.category || null);
  const r = await pool.query(
    `INSERT INTO transaction_categories (transaction_id, user_id, category_group, category, source, updated_at)
     SELECT t.id, $1, x.grp, x.cat, 'rule', NOW()
       FROM unnest($2::bigint[], $3::text[], $4::text[]) AS x(tid, grp, cat)
       JOIN transactions t ON t.id = x.tid AND t.user_id = $1
     ON CONFLICT (transaction_id)
     DO UPDATE SET category_group = EXCLUDED.category_group, category = EXCLUDED.category, source = 'rule', updated_at = NOW()`,
    [userId, ids, groups, cats]
  );
  return r.rowCount;
}

module.exports = {
  upsertBasiqTransactions, getRecentTransactions, getTxnsSince,
  getTransactionsForQuality,
  getTransactionsWithCategory, getTxnsForSubscriptions,
  listRules, createRule, deleteRule, setTransactionCategory, applyCategoryAssignments,
};
