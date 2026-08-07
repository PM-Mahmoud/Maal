'use strict';

const pool = require('./pool');

async function replaceAccounts(userId, accounts) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM linked_accounts WHERE user_id = $1 AND account_reference LIKE 'lunchflow:%'`,
      [userId]
    );
    for (const account of accounts) {
      await client.query(
        `INSERT INTO linked_accounts
           (user_id, institution_name, institution_type, account_reference, balance, connection_status)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          userId, account.institution_name, account.institution_type,
          account.account_reference, account.balance,
          account.status === 'active' ? 'active' : 'disconnected',
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

async function upsertTransactions(userId, transactions) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM transactions
        WHERE user_id = $1 AND status = 'pending' AND basiq_id LIKE 'lunchflow:%'`,
      [userId]
    );
    let saved = 0;
    for (const transaction of transactions) {
      const { rows } = await client.query(
        `INSERT INTO transactions (user_id, basiq_id, description, amount, status, post_date)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id, basiq_id) WHERE basiq_id IS NOT NULL DO UPDATE
           SET description = EXCLUDED.description, amount = EXCLUDED.amount,
               status = EXCLUDED.status, post_date = EXCLUDED.post_date
         RETURNING id`,
        [
          userId, transaction.provider_id, transaction.description,
          transaction.amount, transaction.status, transaction.post_date,
        ]
      );
      await client.query(
        `INSERT INTO transaction_provider_details
           (transaction_id, user_id, account_reference, observed_at)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (transaction_id) DO UPDATE
           SET account_reference = EXCLUDED.account_reference, observed_at = NOW()`,
        [rows[0].id, userId, transaction.account_reference]
      );
      saved++;
    }
    await client.query('COMMIT');
    return { saved };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { replaceAccounts, upsertTransactions };
