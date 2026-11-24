const tables = ['cash_accounts', 'investments', 'properties', 'debts', 'super_accounts', 'other_assets'];

module.exports = {
  name: 'manual_account_net_worth',
  async up(client) {
    for (const table of tables) {
      await client.query(
        `ALTER TABLE ${table}
           ADD COLUMN IF NOT EXISTS start_date DATE,
           ADD COLUMN IF NOT EXISTS include_in_net_worth BOOLEAN DEFAULT TRUE`
      );
    }
  },
};
