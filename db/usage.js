// db/usage.js — per-user, per-feature, per-month usage counters (metering).
// All queries scoped by user_id (IDOR rule). Period key = 'YYYY-MM'.

const { pool } = require('./auth');
const { periodKey, MONTHLY_FEATURES } = require('../lib/plan-limits');

// { advisor_messages: 3, research_runs: 1, ... } for the current period.
async function getCounts(userId, period) {
  const p = period || periodKey();
  const r = await pool.query(
    `SELECT feature, used FROM usage_counters WHERE user_id = $1 AND period = $2`,
    [userId, p]
  );
  const counts = {};
  MONTHLY_FEATURES.forEach((f) => { counts[f] = 0; });
  r.rows.forEach((row) => { counts[row.feature] = Number(row.used) || 0; });
  return counts;
}

// Atomically add one use; returns the new count for this period.
async function increment(userId, feature, period) {
  const p = period || periodKey();
  const r = await pool.query(
    `INSERT INTO usage_counters (user_id, feature, period, used)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (user_id, feature, period)
     DO UPDATE SET used = usage_counters.used + 1, updated_at = NOW()
     RETURNING used`,
    [userId, feature, p]
  );
  return Number(r.rows[0].used);
}

// Atomically consume one use ONLY IF still under `limit`. Returns the new count,
// or null when already at/over the limit. This closes the check-then-increment
// race (two concurrent requests can't both slip past the cap). Caller must
// short-circuit limit <= 0 itself — this is only invoked when limit >= 1, so the
// INSERT branch (used = 1) is always within limit; the guard protects the
// UPDATE branch.
async function incrementIfUnder(userId, feature, limit, period) {
  const p = period || periodKey();
  const r = await pool.query(
    `INSERT INTO usage_counters (user_id, feature, period, used)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (user_id, feature, period)
     DO UPDATE SET used = usage_counters.used + 1, updated_at = NOW()
       WHERE usage_counters.used < $4
     RETURNING used`,
    [userId, feature, p, limit]
  );
  return r.rows.length ? Number(r.rows[0].used) : null;
}

// Concurrent limit input: how many radars are active right now.
async function countActiveRadars(userId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM radars WHERE user_id = $1 AND active = true`,
    [userId]
  );
  return r.rows[0].n;
}

module.exports = { getCounts, increment, incrementIfUnder, countActiveRadars };
