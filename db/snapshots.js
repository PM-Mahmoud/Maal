// db/snapshots.js
// Daily net-worth snapshots — one row per user per day (upserted).

const { pool } = require('./auth');

async function recordSnapshot(userId, { netWorth, assetsTotal, superBalance, investBalance, debtsTotal, cashBalance }) {
  await pool.query(
    `INSERT INTO net_worth_snapshots
       (user_id, snap_date, net_worth, assets_total, super_balance, invest_balance, debts_total, cash_balance)
     VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, snap_date)
     DO UPDATE SET net_worth = $2, assets_total = $3, super_balance = $4,
                   invest_balance = $5, debts_total = $6, cash_balance = $7`,
    [userId, netWorth, assetsTotal, superBalance, investBalance, debtsTotal, cashBalance || 0]
  );
}

async function getSnapshots(userId, days) {
  const result = await pool.query(
    `SELECT snap_date, net_worth, assets_total, super_balance, invest_balance, debts_total, cash_balance
     FROM net_worth_snapshots
     WHERE user_id = $1 AND snap_date >= CURRENT_DATE - $2::int
     ORDER BY snap_date ASC`,
    [userId, days]
  );
  return result.rows;
}

// Pure: derive today's snapshot values from a (merged effective) profile.
// Shared by the EJS dashboard and GET /api/v1/snapshots so both record and read
// identical numbers. Postgres BIGINT columns come back as strings — Number() them.
function snapshotValuesFromProfile(profile) {
  const p = profile || {};
  const superBalance  = Number(p.super_balance) || 0;
  const investBalance = Number(p.investment_portfolio) || 0;
  const propertyValue = Number(p.property_value) || 0;
  const cashBalance   = Number(p.cash_savings) || 0;
  const debtsTotal    = (Number(p.hecs_balance) || 0) + (Number(p.total_debt) || 0);
  const assetsTotal   = superBalance + investBalance + propertyValue + cashBalance;
  return { netWorth: assetsTotal - debtsTotal, assetsTotal, superBalance, investBalance, debtsTotal, cashBalance };
}

module.exports = { recordSnapshot, getSnapshots, snapshotValuesFromProfile };
