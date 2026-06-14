// db/vault.js — real document storage in Postgres (bytea). 'kind' separates
// the Vault ('vault') from uploaded bank statements ('statement').

const { pool } = require('./auth');

async function addFile(userId, { kind, filename, mime, size, content }) {
  const r = await pool.query(
    `INSERT INTO vault_files (user_id, kind, filename, mime, size_bytes, content)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, kind || 'vault', filename, mime || null, size || 0, content]
  );
  return r.rows[0].id;
}

// Metadata only (no bytea) for listing
async function listFiles(userId, kind) {
  const r = await pool.query(
    `SELECT id, filename, mime, size_bytes, created_at
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

async function deleteFile(id, userId) {
  await pool.query(`DELETE FROM vault_files WHERE id = $1 AND user_id = $2`, [id, userId]);
}

module.exports = { addFile, listFiles, getFile, deleteFile };
