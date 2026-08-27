// db/vault.js — real document storage in Postgres (bytea). 'kind' separates
// the Vault ('vault') from uploaded bank statements ('statement').

const { pool } = require('./auth');

async function addFile(userId, { kind, filename, mime, size, content, extractedText }) {
  const r = await pool.query(
    `INSERT INTO vault_files (user_id, kind, filename, mime, size_bytes, content, extracted_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [userId, kind || 'vault', filename, mime || null, size || 0, content, extractedText || null]
  );
  return r.rows[0].id;
}

// Metadata only (no bytea) for listing. has_text flags whether Maal can read
// the document (i.e. text was successfully extracted on upload).
async function listFiles(userId, kind) {
  const r = await pool.query(
    `SELECT id, filename, mime, size_bytes, created_at,
            (extracted_text IS NOT NULL AND length(extracted_text) > 0) AS has_text
       FROM vault_files WHERE user_id = $1 AND kind = $2
       ORDER BY created_at DESC`,
    [userId, kind || 'vault']
  );
  return r.rows;
}

async function getFile(id, userId) {
  const r = await pool.query(
    `SELECT filename, mime, content FROM vault_files WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return r.rows[0] || null;
}

// Extracted text for one document (used by the "Extract figures" flow).
async function getTextById(id, userId) {
  const r = await pool.query(
    `SELECT filename, extracted_text FROM vault_files WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return r.rows[0] || null;
}

// All readable Vault documents' text for a user, most recent first — fed into
// the Ask Maal context so the advisor can answer from them.
async function getReadableDocs(userId) {
  const r = await pool.query(
    `SELECT filename, extracted_text FROM vault_files
       WHERE user_id = $1 AND kind = 'vault'
         AND extracted_text IS NOT NULL AND length(extracted_text) > 0
       ORDER BY created_at DESC`,
    [userId]
  );
  return r.rows;
}

async function deleteFile(id, userId) {
  await pool.query(`DELETE FROM vault_files WHERE id = $1 AND user_id = $2`, [id, userId]);
}

module.exports = { addFile, listFiles, getFile, getTextById, getReadableDocs, deleteFile };
