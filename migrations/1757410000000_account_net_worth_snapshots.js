const { captureAccountSnapshots } = require('../db/account-snapshots');

module.exports = {
  name: 'account_net_worth_snapshots',
  async up(client) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS account_net_worth_snapshots (
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_key TEXT NOT NULL,
        snap_date DATE NOT NULL,
        net_worth NUMERIC(20, 2) NOT NULL,
        PRIMARY KEY (user_id, account_key, snap_date)
      )
    `);
    // Seed the first honest per-account point using today's account register.
    const { rows: users } = await client.query(
      `SELECT id, (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Perth')::date::text AS snapshot_date
         FROM users ORDER BY id`
    );
    for (const user of users) await captureAccountSnapshots(client, user.id, user.snapshot_date);
  },
};
