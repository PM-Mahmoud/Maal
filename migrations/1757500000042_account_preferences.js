'use strict';
// HEL-42 — per-account Rename / "Show in net worth" choices that must survive a
// provider refresh. Provider imports (Basiq) delete and re-insert their mirror
// rows, so a choice stored only on the row would be lost. Choices for linked
// rows are kept here, keyed by the stable provider reference
// ("basiq:<id>" / "lunchflow:<id>"), and re-applied after each import.
// Additive only: references users but does not alter it.
module.exports = {
  name: 'account_preferences',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS account_preferences (
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_key TEXT NOT NULL,
        display_name TEXT,
        include_in_net_worth BOOLEAN,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, account_key)
      )
    `);
  },
};
