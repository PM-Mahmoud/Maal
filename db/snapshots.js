// db/snapshots.js
// Daily net-worth snapshots — one row per user per day (upserted).

const { pool } = require('./auth');

async function recordSnapshot(userId, { netWorth, assetsTotal, superBalance, investBalance, debtsTotal }) {
  await pool.query(
    `INSERT INTO net_worth_snapshots
       (user_id, snap_date, net_worth, assets_total, super_balance, invest_balance, debts_total)
     VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, snap_date)
     DO UPDATE SET net_worth = $2, assets_total = $3, super_balance = $4,
                   invest_balance = $5, debts_total = $6`,
    [userId, netWorth, assetsTotal, superBalance, investBalance, debtsTotal]
  );
}

async function getSnapshots(userId, days) {
  const result = await pool.query(
    `SELECT snap_date, net_worth, assets_total, super_balance, invest_balance, debts_total
     FROM net_worth_snapshots
     WHERE user_id = $1 AND snap_date >= CURRENT_DATE - $2::int
     ORDER BY snap_date ASC`,
    [userId, days]
  );
  return result.rows;
}

module.exports = { recordSnapshot, getSnapshots };
