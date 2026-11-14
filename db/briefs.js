// db/briefs.js — reads for the Home briefs (weekly recap + daily market brief).
//
// Per-user queries filter by user_id in SQL (ownership check, no RLS here).
// Dates come back as ::text so pg never shifts a DATE through the host timezone.

const { pool } = require('./auth');

// The user's net-worth snapshots from `fromDate` (YYYY-MM-DD) onwards.
async function getSnapshotsFrom(userId, fromDate) {
  const r = await pool.query(
    `SELECT snap_date::text AS snap_date, net_worth
       FROM net_worth_snapshots
      WHERE user_id = $1 AND snap_date >= $2::date
      ORDER BY snap_date ASC`,
    [userId, fromDate]
  );
  return r.rows;
}

// The user's transactions in [fromDate, toDate] with any assigned category.
// Read-only against the protected transactions table.
async function getTransactionsBetween(userId, fromDate, toDate) {
  const r = await pool.query(
    `SELECT t.description, t.amount, t.post_date::text AS post_date, c.category_group
       FROM transactions t
       LEFT JOIN transaction_categories c ON c.transaction_id = t.id AND c.user_id = t.user_id
      WHERE t.user_id = $1
        AND t.post_date >= $2::date AND t.post_date <= $3::date
      ORDER BY t.post_date ASC, t.id ASC
      LIMIT 2000`,
    [userId, fromDate, toDate]
  );
  return r.rows;
}

// ─── market_briefs (global, not per-user) ─────────────────────────────────
async function getMarketBrief(briefDate) {
  const r = await pool.query(
    `SELECT brief_date::text AS brief_date, payload, generated_at FROM market_briefs WHERE brief_date = $1::date`,
    [briefDate]
  );
  return r.rows[0] || null;
}

async function saveMarketBrief(briefDate, payload) {
  const r = await pool.query(
    `INSERT INTO market_briefs (brief_date, payload) VALUES ($1::date, $2::jsonb)
     ON CONFLICT (brief_date) DO UPDATE SET payload = EXCLUDED.payload, generated_at = NOW()
     RETURNING brief_date::text AS brief_date, payload, generated_at`,
    [briefDate, JSON.stringify(payload)]
  );
  return r.rows[0];
}

// Recent cached briefs before `briefDate`, for building index sparklines.
async function getRecentMarketBriefs(briefDate, days = 30) {
  const r = await pool.query(
    `SELECT brief_date::text AS brief_date, payload
       FROM market_briefs
      WHERE brief_date < $1::date AND brief_date >= $1::date - $2::int
      ORDER BY brief_date ASC`,
    [briefDate, days]
  );
  return r.rows;
}

module.exports = { getSnapshotsFrom, getTransactionsBetween, getMarketBrief, saveMarketBrief, getRecentMarketBriefs };
