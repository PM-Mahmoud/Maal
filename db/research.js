// db/research.js — persisted Research reports.

const { pool } = require('./auth');

async function createReport(userId, question) {
  const r = await pool.query(
    `INSERT INTO research_reports (user_id, question, status) VALUES ($1, $2, 'pending') RETURNING id`,
    [userId, question]
  );
  return r.rows[0].id;
}

async function completeReport(id, report, sources) {
  await pool.query(
    `UPDATE research_reports
        SET status = 'complete', report = $2, sources = $3, completed_at = NOW()
      WHERE id = $1`,
    [id, report, JSON.stringify(sources || [])]
  );
}

async function failReport(id, message) {
  await pool.query(
    `UPDATE research_reports SET status = 'error', report = $2, completed_at = NOW() WHERE id = $1`,
    [id, message || 'Research failed.']
  );
}

async function listReports(userId, limit = 20) {
  const r = await pool.query(
    `SELECT id, question, status, created_at, completed_at
       FROM research_reports WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return r.rows;
}

async function getReport(id, userId) {
  const r = await pool.query(
    `SELECT * FROM research_reports WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return r.rows[0] || null;
}

// Full rows incl. report + sources — the React research history renders reports
// straight from the list (no per-item re-fetch), so it needs the body inline.
async function listReportsWithBody(userId, limit = 20) {
  const r = await pool.query(
    `SELECT id, question, status, report, sources, created_at, completed_at
       FROM research_reports
      WHERE user_id = $1 AND status = 'complete'
      ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return r.rows;
}

async function deleteReport(id, userId) {
  await pool.query(`DELETE FROM research_reports WHERE id = $1 AND user_id = $2`, [id, userId]);
}

// Pure: turn the Markdown-ish report string (produced by services/research.js)
// into the structured body the React report view renders. Splits on markdown
// headings (#/##/###) into sections; text before the first heading becomes the
// summary; sources are listed under considerations. Kept pure + testable.
function researchBodyFromReport(question, reportText, sources) {
  const text = String(reportText || '').trim();
  const rawSources = typeof sources === 'string' ? safeParse(sources) : (sources || []);
  const sections = [];
  let summary = '';
  let cur = null;
  for (const line of text.split('\n')) {
    const h = line.match(/^\s{0,3}#{1,3}\s+(.*)$/);
    if (h) {
      if (cur) sections.push(cur);
      cur = { heading: h[1].trim(), body: '' };
    } else if (cur) {
      cur.body += (cur.body ? '\n' : '') + line;
    } else {
      summary += (summary ? '\n' : '') + line;
    }
  }
  if (cur) sections.push(cur);
  for (const s of sections) s.body = s.body.trim();
  if (!sections.length && text) {
    sections.push({ heading: 'Report', body: text });
    summary = '';
  }
  const considerations = Array.isArray(rawSources) && rawSources.length
    ? 'Sources:\n' + rawSources.map((s, i) => `[${i + 1}] ${s.title || s.url || 'Source'}${s.url ? ' — ' + s.url : ''}`).join('\n')
    : '';
  return { title: question, summary: summary.trim(), sections, key_facts: [], risks: [], considerations };
}

// DB row → the React Report shape { id, topic, body, created_at }.
function rowToResearchReport(row) {
  return {
    id: String(row.id),
    topic: row.question,
    body: researchBodyFromReport(row.question, row.report, row.sources),
    created_at: row.created_at,
    status: row.status,
  };
}

function safeParse(s) { try { return JSON.parse(s); } catch { return []; } }

module.exports = {
  createReport, completeReport, failReport, listReports, getReport,
  listReportsWithBody, deleteReport, researchBodyFromReport, rowToResearchReport,
};
