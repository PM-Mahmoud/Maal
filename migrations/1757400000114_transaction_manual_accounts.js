/**
 * HEL-114 — an optional cash account for a manually entered transaction.
 * Human review required before applying. The protected tables are referenced
 * by foreign keys, and provider-observed details remain separate.
 */
module.exports = {
  name: 'transaction_manual_accounts',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS transaction_manual_accounts (
        transaction_id BIGINT PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        cash_account_id BIGINT NOT NULL REFERENCES cash_accounts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_transaction_manual_accounts_cash_account
        ON transaction_manual_accounts(cash_account_id);
    `);
  },
};
