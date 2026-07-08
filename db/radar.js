// db/radar.js — persisted Radar watches + their event log.

const { pool } = require('./auth');

async function createRadar(userId, { prompt, symbols, frequency, notifyEmail, notifySms }) {
  const r = await pool.query(
    `INSERT INTO radars (user_id, prompt, symbols, frequency, notify_email, notify_sms)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, prompt, symbols || [], frequency || 'daily', notifyEmail !== false, !!notifySms]
  );
  return r.rows[0].id;
}

async function listRadars(userId) {
  const r = await pool.query(
    `SELECT * FROM radars WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return r.rows;
}

async function getRadar(id, userId) {
  const r = await pool.query(`SELECT * FROM radars WHERE id = $1 AND user_id = $2`, [id, userId]);
  return r.rows[0] || null;
}

async function deleteRadar(id, userId) {
  await pool.query(`DELETE FROM radars WHERE id = $1 AND user_id = $2`, [id, userId]);
}

async function recordRun(id, { result, alerted }) {
  await pool.query(
    `UPDATE radars SET last_run_at = NOW(), last_result = $2, last_alerted = $3 WHERE id = $1`,
    [id, result, !!alerted]
  );
}

// Pause/resume a radar (ownership-scoped).
async function setRadarActive(id, userId, active) {
  await pool.query(
    `UPDATE radars SET active = $3 WHERE id = $1 AND user_id = $2`,
    [id, userId, !!active]
  );
}

// The user's radar event log (most recent first), joined so ownership is
// enforced via the parent radar's user_id.
async function listEvents(userId, limit = 30) {
  const r = await pool.query(
    `SELECT e.id, e.radar_id, e.alerted, e.summary, e.created_at
       FROM radar_events e JOIN radars r ON r.id = e.radar_id
      WHERE r.user_id = $1
      ORDER BY e.created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return r.rows;
}

async function logEvent(radarId, alerted, summary) {
  await pool.query(
    `INSERT INTO radar_events (radar_id, alerted, summary) VALUES ($1, $2, $3)`,
    [radarId, !!alerted, summary]
  );
}

// All active radars whose frequency interval has elapsed since last_run_at.
async function dueRadars() {
  const r = await pool.query(
    `SELECT r.*, u.email AS user_email, u.phone AS user_phone
       FROM radars r JOIN users u ON u.id = r.user_id
      WHERE r.active = true AND (
        r.last_run_at IS NULL
        OR (r.frequency = 'daily'   AND r.last_run_at < NOW() - INTERVAL '1 day')
        OR (r.frequency = 'weekly'  AND r.last_run_at < NOW() - INTERVAL '7 days')
        OR (r.frequency = 'monthly' AND r.last_run_at < NOW() - INTERVAL '30 days')
      )`
  );
  return r.rows;
}

// Pure: map a radars row to the React "alert" shape, and a radar_events row to
// the React event shape. Kept pure so the field contract is unit-tested.
function radarToAlert(row) {
  return {
    id: String(row.id),
    prompt: row.prompt,
    frequency: row.frequency,
    notify_email: row.notify_email !== false,
    notify_sms: !!row.notify_sms,
    active: row.active !== false,
    time_aest: null,                 // no schedule-time column server-side
    symbols: row.symbols || [],
    last_run_at: row.last_run_at || null,
  };
}

function eventToAlertEvent(row) {
  return {
    id: String(row.id),
    alert_id: String(row.radar_id),
    message: row.summary,
    alerted: !!row.alerted,
    created_at: row.created_at,
    email_status: null,
  };
}

module.exports = {
  createRadar, listRadars, getRadar, deleteRadar, recordRun, logEvent, dueRadars,
  setRadarActive, listEvents, radarToAlert, eventToAlertEvent,
};
