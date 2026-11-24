const pool = require('./pool');
const { classifyAccountType } = require('../lib/connected');

const accountKinds = {
  cash: { table: 'cash_accounts', type: 'cash' },
  invest: { table: 'investments', type: 'brokerage' },
  super: { table: 'super_accounts', type: 'super' },
  debt: { table: 'debts', type: 'liability' },
};

async function canonicalAccountFor(client, userId, linked) {
  const reference = linked.account_reference;
  const externalId = reference.slice('basiq:'.length);
  const { rows: [existingLink] } = await client.query(
    `SELECT account.id, account.legacy_key, link.status
       FROM canonical_account_links link
       JOIN financial_accounts account ON account.id = link.financial_account_id AND account.user_id = link.user_id
      WHERE link.user_id = $1 AND link.provider = 'basiq' AND link.external_account_id = $2`,
    [userId, externalId]
  );
  if (existingLink) return existingLink.status === 'active' ? existingLink : null;

  const kind = accountKinds[classifyAccountType(linked.institution_type, linked.balance)];
  const { rows: [existingAccount] } = await client.query(
    `SELECT account.id, account.legacy_key
       FROM financial_accounts account
      WHERE account.user_id = $1
        AND account.source = 'basiq'
        AND (account.external_reference = $2 OR account.legacy_key IN (
          SELECT $3 || ':' || asset.id || ':account' FROM ${kind.table} asset
           WHERE asset.user_id = $1 AND asset.account_reference = $2 AND asset.source = 'basiq'
        ))
      ORDER BY (account.external_reference = $2) DESC NULLS LAST, account.id
      LIMIT 1`,
    [userId, reference, kind.table]
  );
  let account = existingAccount;
  if (!account) {
    const result = await client.query(
      `INSERT INTO financial_accounts
         (user_id, account_type, name, institution, external_reference, source, confidence, as_of)
       VALUES ($1, $2, $3, $3, $4, 'basiq', 0.950, NOW())
       ON CONFLICT (user_id, source, external_reference) WHERE external_reference IS NOT NULL
       DO UPDATE SET updated_at = NOW()
       RETURNING id, legacy_key`,
      [userId, kind.type, linked.institution_name, reference]
    );
    account = result.rows[0];
  }

  await client.query(
    `INSERT INTO canonical_account_links
       (user_id, provider, external_account_id, financial_account_id, match_method, confidence, status, last_seen_at)
     VALUES ($1, 'basiq', $2, $3, 'provider_reference', 0.950, 'active', NOW())`,
    [userId, externalId, account.id]
  );
  return account;
}

async function recordOwnerType(client, userId, linked, account, ownerType) {
  const legacyKey = /^(cash_accounts|investments|debts|super_accounts):[0-9]+:account$/.test(account.legacy_key)
    ? account.legacy_key : null;
  const subjectKey = legacyKey || `financial_account:${account.id}`;
  const interestKey = legacyKey ? legacyKey.replace(/:account$/, ':ownership') : `${linked.account_reference}:ownership`;
  // The picker collects a label. Keep the existing whole-account share until
  // explicit household allocations establish the members and percentages.
  // Other active interests take precedence, including the household model.
  const { rowCount } = await client.query(
    `INSERT INTO ownership_interests
       (user_id, subject_type, subject_key, owner_type, ownership_percent, effective_from, legacy_key)
     SELECT $1, 'financial_account', $2, $3, 100, NOW(), $4
      WHERE NOT EXISTS (
        SELECT 1 FROM ownership_interests
         WHERE user_id = $1 AND subject_type = 'financial_account' AND subject_key = $2
           AND legacy_key IS DISTINCT FROM $4
           AND effective_from <= NOW() AND (effective_to IS NULL OR effective_to > NOW())
      )
     ON CONFLICT (user_id, legacy_key) DO UPDATE
       SET owner_type = EXCLUDED.owner_type, updated_at = NOW()
       WHERE ownership_interests.effective_to IS NULL
         AND ownership_interests.subject_type = EXCLUDED.subject_type
         AND ownership_interests.subject_key = EXCLUDED.subject_key`,
    [userId, subjectKey, ownerType, interestKey]
  );
  return rowCount;
}

async function setBasiqOwnerType(userId, runId, references, ownerType) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [run] } = await client.query(
      `SELECT id FROM import_runs WHERE user_id = $1 AND id = $2 AND provider = 'basiq' AND status = 'succeeded'`,
      [userId, runId]
    );
    if (!run) {
      await client.query('ROLLBACK');
      return null;
    }
    const { rows: accounts } = await client.query(
      `SELECT institution_name, institution_type, account_reference, balance
         FROM linked_accounts
        WHERE user_id = $1 AND account_reference LIKE 'basiq:%' AND account_reference = ANY($2::text[])
        ORDER BY account_reference FOR UPDATE`,
      [userId, references]
    );
    if (accounts.length !== references.length) {
      await client.query('ROLLBACK');
      return null;
    }
    let saved = 0;
    for (const linked of accounts) {
      const account = await canonicalAccountFor(client, userId, linked);
      if (account) saved += await recordOwnerType(client, userId, linked, account, ownerType);
    }
    await client.query('COMMIT');
    return { saved, retained: accounts.length - saved };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { setBasiqOwnerType };
