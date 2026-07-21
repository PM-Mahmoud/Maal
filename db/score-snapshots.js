// db/score-snapshots.js
// Daily Maal Score snapshots — one row per user per day (upserted).
//
// Mirrors db/snapshots.js (net worth). The score endpoint recomputes the live
// score from the merged effective profile on every read; this records that
// value at most once per calendar day so the React dashboard has a real history
// series to chart, without the legacy financial_scores table's per-page-load
// row spam.

const { pool } = require('./auth');

// Upsert today's score. Best-effort caller: recording must never fail the live
// score response (see the /api/v1/score handler).
async function recordScoreSnapshot(userId, { score, band, pillars }) {
  await pool.query(
    `INSERT INTO maal_score_snapshots (user_id, snap_date, score, band, pillars)
     VALUES ($1, CURRENT_DATE, $2, $3, $4)
     ON CONFLICT (user_id, snap_date)
     DO UPDATE SET score = $2, band = $3, pillars = $4`,
    [userId, Math.round(Number(score) || 0), band || null, JSON.stringify(pillars || [])]
  );
}

async function getScoreSnapshots(userId, days) {
  const result = await pool.query(
    `SELECT snap_date, score, band, pillars
     FROM maal_score_snapshots
     WHERE user_id = $1 AND snap_date >= CURRENT_DATE - $2::int
     ORDER BY snap_date ASC`,
    [userId, days]
  );
  return result.rows;
}

// Pure: reduce snapshot rows to the { value, at } history series the chart
// expects, oldest first. Kept DB-free so it's deterministically testable.
function shapeScoreSnapshotHistory(rows) {
  return (rows || [])
    .filter((r) => r && r.score != null)
    .map((r) => ({ value: Number(r.score), at: r.snap_date }))
    .filter((p) => Number.isFinite(p.value));
}

module.exports = { recordScoreSnapshot, getScoreSnapshots, shapeScoreSnapshotHistory };
