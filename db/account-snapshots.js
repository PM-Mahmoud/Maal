const pool = require('./pool');

const accountTables = [
  ['cash', 'cash_accounts'],
  ['investments', 'investments'],
  ['super', 'super_accounts'],
  ['properties', 'properties'],
  ['debts', 'debts'],
  ['other', 'other_assets'],
];

async function captureAccountSnapshots(client, userId, date) {
  const { rows } = await client.query(
    accountTables.map(([kind, table]) =>
      `SELECT '${kind}' AS kind, to_jsonb(account) || jsonb_build_object('id', account.id::text) AS account
         FROM ${table} account WHERE account.user_id = $1`
    ).join(' UNION ALL '),
    [userId]
  );
  const accountsByKind = {};
  for (const { kind, account } of rows) {
    (accountsByKind[kind] ||= []).push(account);
  }
  const { buildHomeAccounts, accountSnapshotValues } = await import('../shared/home-accounts.mjs');
  const values = accountSnapshotValues(buildHomeAccounts(accountsByKind));
  if (!values.length) return;
  await client.query(
    `INSERT INTO account_net_worth_snapshots (user_id, snap_date, account_key, net_worth)
     SELECT $1, $2::date, snapshot.account_key, snapshot.net_worth
       FROM jsonb_to_recordset($3::jsonb) AS snapshot(account_key text, net_worth numeric)
     ON CONFLICT (user_id, account_key, snap_date) DO NOTHING`,
    [userId, date, JSON.stringify(values)]
  );
}

async function listAccountSnapshotSeries(userId, accountKeys, days) {
  const { rows } = await pool.query(
    `SELECT snap_date::text AS date, SUM(net_worth) AS value
       FROM account_net_worth_snapshots
      WHERE user_id = $1 AND account_key = ANY($2::text[])
        AND snap_date >= (NOW() AT TIME ZONE 'Australia/Perth')::date - $3::int
      GROUP BY snap_date
      ORDER BY snap_date`,
    [userId, accountKeys, days]
  );
  return rows.map(({ date, value }) => ({ date, value: Number(value) }));
}

module.exports = { captureAccountSnapshots, listAccountSnapshotSeries };
