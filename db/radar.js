// db/radar.js — persisted Radar watches + their event log.

const { pool } = require('./auth');

// Scheduling extras (PR 9). schedule_day is 0-6 (Sun..Sat) for weekly radars,
// or null; time_aest is 'HH:MM' local send time; template_slug records the
// curated template a radar started from (null for free-text).
function scheduleCols(data) {
  const dayRaw = data.scheduleDay;
  const day = dayRaw == null || dayRaw === '' ? null
    : (Number.isInteger(Number(dayRaw)) && Number(dayRaw) >= 0 && Number(dayRaw) <= 6 ? Number(dayRaw) : null);
  const time = /^\d{1,2}:\d{2}$/.test(String(data.timeAest || '')) ? String(data.timeAest) : null;
  const slug = data.templateSlug ? String(data.templateSlug).slice(0, 64) : null;
  return { day, time, slug };
}

async function createRadar(userId, { prompt, symbols, frequency, notifyEmail, notifySms, timeAest, scheduleDay, templateSlug }) {
  const { day, time, slug } = scheduleCols({ timeAest, scheduleDay, templateSlug });
  const r = await pool.query(
    `INSERT INTO radars (user_id, prompt, symbols, frequency, notify_email, notify_sms, time_aest, schedule_day, template_slug)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [userId, prompt, symbols || [], frequency || 'daily', notifyEmail !== false, !!notifySms, time, day, slug]
  );
  return r.rows[0].id;
}

// Curated radar templates (marketplace). App content — no user scoping; browsable
// by everyone. Ordered for a stable grid.
async function listTemplates() {
  const r = await pool.query(
    `SELECT id, slug, category, wealth_stage, title, sub, prompt, default_frequency
       FROM radar_templates WHERE active = true ORDER BY sort_order ASC, id ASC`
  );
  return r.rows.map((t) => ({
    id: String(t.id),
    slug: t.slug,
    category: t.category,
    wealth_stage: t.wealth_stage,
    title: t.title,
    sub: t.sub,
    prompt: t.prompt,
    default_frequency: t.default_frequency,
  }));
}

// Create a radar only if the user is under their concurrent active-radar limit,
// enforced atomically. A per-user transaction advisory lock serialises the
// count-then-insert so two concurrent creates can't both slip past the cap.
// Returns the new id, or null when already at/over the limit.
async function createRadarIfUnderActiveLimit(userId, data, limit) {
  if (limit <= 0) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [userId]);
    const c = await client.query('SELECT COUNT(*)::int AS n FROM radars WHERE user_id = $1 AND active = true', [userId]);
    if (c.rows[0].n >= limit) { await client.query('ROLLBACK'); return null; }
    const { day, time, slug } = scheduleCols(data);
    const r = await client.query(
      `INSERT INTO radars (user_id, prompt, symbols, frequency, notify_email, notify_sms, time_aest, schedule_day, template_slug)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [userId, data.prompt, data.symbols || [], data.frequency || 'daily', data.notifyEmail !== false, !!data.notifySms, time, day, slug]
    );
    await client.query('COMMIT');
    return r.rows[0].id;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Re-activate a paused radar only if doing so keeps the user under their limit,
// enforced atomically (same advisory-lock pattern). Deactivation is unlimited,
// so that path stays on setRadarActive. Returns true if activated, false if the
// limit would be exceeded.
async function activateRadarIfUnderLimit(id, userId, limit) {
  if (limit <= 0) return false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [userId]);
    // Exclude this radar from the count so re-toggling an already-active one is a no-op, not a false block.
    const c = await client.query('SELECT COUNT(*)::int AS n FROM radars WHERE user_id = $1 AND active = true AND id <> $2', [userId, id]);
    if (c.rows[0].n >= limit) { await client.query('ROLLBACK'); return false; }
    await client.query('UPDATE radars SET active = true WHERE id = $1 AND user_id = $2', [id, userId]);
    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
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
// All active radars with the fields the scheduler needs. Precision (local send
// time + day-of-week) is applied in JS by lib/radar-logic.isRadarDue, which is
// deterministic-tested — the SQL here is just "active, with a coarse elapsed
// pre-filter" so we don't fetch radars that obviously can't be due yet.
async function dueRadars() {
  const r = await pool.query(
    `SELECT r.*, u.email AS user_email, u.phone AS user_phone
       FROM radars r JOIN users u ON u.id = r.user_id
      WHERE r.active = true AND (
        r.last_run_at IS NULL
        OR r.last_run_at < NOW() - INTERVAL '20 hours'
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
    time_aest: row.time_aest || null,
    schedule_day: row.schedule_day == null ? null : Number(row.schedule_day),
    template_slug: row.template_slug || null,
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
  createRadar, createRadarIfUnderActiveLimit, activateRadarIfUnderLimit,
  listRadars, getRadar, deleteRadar, recordRun, logEvent, dueRadars,
  setRadarActive, listEvents, radarToAlert, eventToAlertEvent,
  listTemplates,
};
