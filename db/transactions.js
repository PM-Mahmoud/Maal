// db/transactions.js
// Basiq transactions persisted at sync time (see routes/basiq.js).

const { pool } = require('./auth');
const { mapBasiqTransaction } = require('../lib/basiq-mapping');

async function upsertBasiqTransactions(userId, txns) {
  let saved = 0;
  for (const raw of txns) {
    const t = mapBasiqTransaction(raw);
    if (!t) continue;
    await pool.query(
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
  return saved;
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

module.exports = { upsertBasiqTransactions, getRecentTransactions, getTxnsSince };
