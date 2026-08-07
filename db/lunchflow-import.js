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

async function promoteCanonicalAccounts(userId, accounts) {
  const client = await pool.connect();
  const result = { promoted: 0, needs_review: 0, unclassified: 0 };
  try {
    await client.query('BEGIN');
    for (const account of accounts) {
      if (!account.account_type) { result.unclassified++; continue; }
      const externalId = account.account_reference.replace(/^lunchflow:/, '');
      const linked = await client.query(
        `SELECT financial_account_id, status FROM canonical_account_links
          WHERE user_id=$1 AND provider='lunchflow' AND external_account_id=$2`,
        [userId, externalId]
      );
      let accountId = linked.rows[0]?.financial_account_id;
      let linkStatus = linked.rows[0]?.status;
      if (!accountId) {
        const possibleDuplicate = await client.query(
          `SELECT id FROM financial_accounts
            WHERE user_id=$1 AND account_type=$2 AND currency=$3
              AND LOWER(COALESCE(institution,''))=LOWER($4)
              AND LOWER(name)=LOWER($5)
            ORDER BY id LIMIT 1`,
          [userId, account.account_type, account.currency, account.institution_name, account.label]
        );
        if (possibleDuplicate.rows[0]) {
          accountId = possibleDuplicate.rows[0].id;
          linkStatus = 'needs_review';
          result.needs_review++;
        } else {
          const inserted = await client.query(
            `INSERT INTO financial_accounts
               (user_id, account_type, name, institution, external_reference, currency, source, confidence, as_of)
             VALUES ($1,$2,$3,$4,$5,$6,'lunchflow',0.950,$7) RETURNING id`,
            [userId, account.account_type, account.label, account.institution_name,
             account.account_reference, account.currency, account.observed_at]
          );
          accountId = inserted.rows[0].id;
          linkStatus = account.currency === 'AUD' ? 'active' : 'needs_review';
          if (linkStatus === 'needs_review') result.needs_review++;
        }
        await client.query(
          `INSERT INTO canonical_account_links
             (user_id, provider, external_account_id, financial_account_id, match_method, confidence, status, last_seen_at)
           VALUES ($1,'lunchflow',$2,$3,$4,$5,$6,$7)
           ON CONFLICT (user_id, provider, external_account_id) DO UPDATE SET
             financial_account_id=EXCLUDED.financial_account_id, status=EXCLUDED.status,
             confidence=EXCLUDED.confidence, last_seen_at=EXCLUDED.last_seen_at, updated_at=NOW()`,
          [userId, externalId, accountId, linkStatus === 'active' ? 'provider_reference' : 'exact_metadata',
           linkStatus === 'active' ? 0.95 : 0.8, linkStatus, account.observed_at]
        );
      } else {
        await client.query(
          `UPDATE canonical_account_links SET last_seen_at=$4, updated_at=NOW()
            WHERE user_id=$1 AND provider=$2 AND external_account_id=$3`,
          [userId, 'lunchflow', externalId, account.observed_at]
        );
      }
      if (account.currency !== 'AUD' && linkStatus === 'active') {
        linkStatus = 'needs_review';
        result.needs_review++;
        await client.query(
          `UPDATE canonical_account_links SET status='needs_review', updated_at=NOW()
            WHERE user_id=$1 AND provider='lunchflow' AND external_account_id=$2`,
          [userId, externalId]
        );
      }
      if (linkStatus !== 'active') continue;
      const classification = { cash: 'cash', brokerage: 'investment', super: 'super', liability: 'debt' }[account.account_type];
      const amountMinor = Math.round(Math.abs(Number(account.balance)) * 100);
      await client.query(
        `INSERT INTO valuations
           (user_id, subject_type, subject_key, classification, amount_minor, currency, as_of, source, confidence, legacy_key)
         VALUES ($1,'financial_account',$2,$3,$4,$5,$6,'lunchflow',0.950,$7)
         ON CONFLICT (user_id, legacy_key) DO NOTHING`,
        [userId, `financial_account:${accountId}`, classification, amountMinor,
         account.currency, account.observed_at, `lunchflow:${externalId}:balance:${account.observed_at}`]
      );
      await client.query(
        `INSERT INTO ownership_interests
           (user_id, subject_type, subject_key, owner_type, ownership_percent, effective_from, legacy_key)
         VALUES ($1,'financial_account',$2,'self',100,$3,$4)
         ON CONFLICT (user_id, legacy_key) DO NOTHING`,
        [userId, `financial_account:${accountId}`, account.observed_at, `lunchflow:${externalId}:ownership`]
      );
      result.promoted++;
    }
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { replaceAccounts, upsertTransactions, promoteCanonicalAccounts };
