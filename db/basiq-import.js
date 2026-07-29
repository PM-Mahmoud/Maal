const pool = require('./pool');

async function replaceBasiqAccounts(userId, accounts, quarantinedReferences = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const keep = quarantinedReferences.filter(Boolean);
    const deleteSql = (table) => (
      `DELETE FROM ${table}
        WHERE user_id = $1 AND ${
          table === 'linked_accounts'
            ? "account_reference LIKE 'basiq:%'"
            : "source = 'basiq'"
        }
          AND NOT (account_reference = ANY($2::text[]))`
    );
    for (const table of ['linked_accounts', 'cash_accounts', 'investments', 'debts', 'super_accounts']) {
      await client.query(deleteSql(table), [userId, keep]);
    }

    for (const account of accounts) {
      const linked = account.linked;
      await client.query(
        `INSERT INTO linked_accounts
           (user_id, institution_name, institution_type, account_reference, balance)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          userId, linked.institution_name, linked.institution_type || null,
          linked.account_reference, linked.balance,
        ]
      );

      const row = account.row;
      if (account.bucket === 'cash') {
        await client.query(
          `INSERT INTO cash_accounts
             (user_id, label, institution, balance, source, account_reference)
           VALUES ($1, $2, $3, $4, 'basiq', $5)`,
          [userId, row.label, row.institution || null, row.balance, row.account_reference]
        );
      } else if (account.bucket === 'invest') {
        await client.query(
          `INSERT INTO investments
             (user_id, name, kind, value, source, account_reference)
           VALUES ($1, $2, $3, $4, 'basiq', $5)`,
          [userId, row.name, row.kind || 'other', row.value, row.account_reference]
        );
      } else if (account.bucket === 'debt') {
        await client.query(
          `INSERT INTO debts
             (user_id, label, kind, balance, source, account_reference)
           VALUES ($1, $2, $3, $4, 'basiq', $5)`,
          [userId, row.label, row.kind || 'other', row.balance, row.account_reference]
        );
      } else if (account.bucket === 'super') {
        await client.query(
          `INSERT INTO super_accounts
             (user_id, label, fund_name, balance, source, account_reference)
           VALUES ($1, $2, $3, $4, 'basiq', $5)`,
          [userId, row.label, row.fund_name || null, row.balance, row.account_reference]
        );
      } else {
        throw new Error(`Unsupported Basiq account bucket: ${account.bucket}`);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { replaceBasiqAccounts };
