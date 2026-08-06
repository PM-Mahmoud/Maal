// db/snapshots.js
// Daily net-worth snapshots — one row per user per day (upserted).

const { pool } = require('./auth');

async function recordSnapshot(userId, dateOrValues, maybeValues) {
  const values = maybeValues || dateOrValues;
  const snapDate = maybeValues ? dateOrValues : new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Perth', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const { netWorth, assetsTotal, superBalance, investBalance, debtsTotal, cashBalance } = values;
  const { rows } = await pool.query(
    `INSERT INTO net_worth_snapshots
       (user_id, snap_date, net_worth, assets_total, super_balance, invest_balance, debts_total, cash_balance)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, snap_date)
     DO NOTHING
     RETURNING *`,
    [userId, snapDate, netWorth, assetsTotal, superBalance, investBalance, debtsTotal, cashBalance]
  );
  if (rows[0]) return rows[0];
  return (await pool.query(
    `SELECT * FROM net_worth_snapshots WHERE user_id = $1 AND snap_date = $2`,
    [userId, snapDate]
  )).rows[0];
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
function snapshotValuesFromProfile(profile, options = {}) {
  const p = profile || {};
  const value = (key) => {
    const raw = p[key];
    if (raw === null || raw === undefined || raw === '') return 0;
    const number = Number(raw);
    if (!Number.isFinite(number)) {
      if (options.strict) throw new Error(`Invalid financial value: ${key}`);
      return 0;
    }
    return Math.round(number * 100) / 100;
  };
  const superBalance = value('super_balance');
  const investBalance = value('investment_portfolio');
  const propertyValue = value('property_value');
  const cashBalance = value('cash_savings');
  const debtsTotal = value('hecs_balance') + value('total_debt');
  const assetsTotal   = superBalance + investBalance + propertyValue + cashBalance;
  return {
    netWorth: Math.round((assetsTotal - debtsTotal) * 100) / 100,
    assetsTotal: Math.round(assetsTotal * 100) / 100,
    superBalance, investBalance, debtsTotal: Math.round(debtsTotal * 100) / 100, cashBalance,
  };
}

async function listSnapshotUserIds() {
  return (await pool.query('SELECT id FROM users ORDER BY id')).rows.map((row) => row.id);
}

module.exports = { recordSnapshot, getSnapshots, snapshotValuesFromProfile, listSnapshotUserIds };
