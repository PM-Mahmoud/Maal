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

module.exports = { createReport, completeReport, failReport, listReports, getReport };
