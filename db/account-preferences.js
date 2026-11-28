'use strict';
// db/account-preferences.js — HEL-42 Rename / Show in net worth.
// Every query is scoped by user_id in the SQL itself (no RLS in Maal).
const pool = require('./pool');
const { NAME_COLUMNS, PROVIDER_MIRROR_TABLES, isProviderReference } = require('../lib/account-preferences');

/**
 * Apply a validated change to one of the user's account rows. For rows that a
 * provider import rewrites, the choice is also stored in account_preferences
 * (keyed by the stable provider reference) so the next refresh keeps it.
 * Returns the updated row, or null when the row isn't the user's.
 */
async function setAccountPreference(userId, table, id, { displayName, include }) {
  const nameColumn = NAME_COLUMNS[table];
  if (!nameColumn) throw new Error('Unsupported account table');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE ${table}
          SET ${nameColumn} = COALESCE($3, ${nameColumn}),
              include_in_net_worth = COALESCE($4, include_in_net_worth)
        WHERE id = $1 AND user_id = $2
        RETURNING *`,
      [id, userId, displayName ?? null, include ?? null]
    );
    const row = rows[0] || null;
    if (row && isProviderReference(row.account_reference)) {
      await client.query(
        `INSERT INTO account_preferences (user_id, account_key, display_name, include_in_net_worth)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, account_key) DO UPDATE SET
           display_name = COALESCE(EXCLUDED.display_name, account_preferences.display_name),
           include_in_net_worth = COALESCE(EXCLUDED.include_in_net_worth, account_preferences.include_in_net_worth),
           updated_at = NOW()`,
        [userId, row.account_reference, displayName ?? null, include ?? null]
      );
    }
    await client.query('COMMIT');
    return row;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Re-apply stored choices to freshly imported provider rows. Called inside the
 * import transaction (db/basiq-import.js) with its client.
 */
async function reapplyAccountPreferences(client, userId) {
  for (const table of PROVIDER_MIRROR_TABLES) {
    const nameColumn = NAME_COLUMNS[table];
    await client.query(
      `UPDATE ${table} AS account
          SET ${nameColumn} = COALESCE(pref.display_name, account.${nameColumn}),
              include_in_net_worth = COALESCE(pref.include_in_net_worth, account.include_in_net_worth)
         FROM account_preferences AS pref
        WHERE account.user_id = $1
          AND pref.user_id = $1
          AND pref.account_key = account.account_reference`,
      [userId]
    );
  }
}

module.exports = { setAccountPreference, reapplyAccountPreferences };
