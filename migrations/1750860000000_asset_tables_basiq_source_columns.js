module.exports = {
  name: 'asset_tables_basiq_source_columns',
  up: async (client) => {
    // Basiq-connected accounts can classify as cash, investments, super, or
    // debt (see lib/connected.js classifyAccountType) — but only
    // cash_accounts got source/account_reference columns in the original
    // asset_tables migration. Adding them here so Basiq sync can write
    // directly into all four tables (source='basiq') instead of a separate
    // runtime-folding layer, and so it can idempotently upsert on re-sync
    // the same way cash_accounts already does.
    await client.query(`
      ALTER TABLE investments ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
      ALTER TABLE investments ADD COLUMN IF NOT EXISTS account_reference TEXT;
      ALTER TABLE debts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
      ALTER TABLE debts ADD COLUMN IF NOT EXISTS account_reference TEXT;
      ALTER TABLE super_accounts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
      ALTER TABLE super_accounts ADD COLUMN IF NOT EXISTS account_reference TEXT;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_investments_account_reference ON investments(account_reference) WHERE account_reference IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_debts_account_reference ON debts(account_reference) WHERE account_reference IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_super_accounts_account_reference ON super_accounts(account_reference) WHERE account_reference IS NOT NULL;

      -- properties isn't a Basiq-syncable type (no account_reference needed),
      -- but still needs 'source' so scripts/backfill-assets.js can tag
      -- backfilled rows and skip users who've already been migrated.
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
    `);
  },
};
