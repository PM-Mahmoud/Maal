const pool = require('./pool');
async function loadForecastInputs(userId) {
  const [accounts, transactions] = await Promise.all([
    pool.query(`SELECT id, label, account_reference, balance FROM cash_accounts WHERE user_id = $1 ORDER BY created_at, id`, [userId]),
    pool.query(`SELECT t.id, t.description, t.amount, t.status, t.post_date, d.account_reference, c.category_group
      FROM transactions t LEFT JOIN transaction_provider_details d ON d.transaction_id = t.id AND d.user_id = t.user_id
      LEFT JOIN transaction_categories c ON c.transaction_id = t.id
      WHERE t.user_id = $1 AND t.post_date >= CURRENT_DATE - 400 ORDER BY t.post_date, t.id`, [userId]),
  ]);
  return { accounts: accounts.rows, transactions: transactions.rows };
}
module.exports = { loadForecastInputs };
