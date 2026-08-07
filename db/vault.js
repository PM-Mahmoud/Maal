// db/vault.js — Vault + uploaded bank-statement storage.
//
// Dual storage, chosen per-file at upload time:
//   - Object storage (Cloudflare R2 / S3-compatible) when services/storage.js is
//     configured. The row keeps a `storage_key`; `content` is NULL. This is the
//     default going forward and keeps file bytes out of Neon's transfer budget.
//   - Postgres `bytea` (`content`) as the fallback when object storage isn't
//     configured, and for every legacy row uploaded before this change.
//
// Reads transparently handle both, so no backfill is required — old files stay
// in bytea, new files go to object storage, and getFile() returns bytes either
// way. `extracted_text` always stays in Postgres (it's small text the advisor
// reads, not the raw file).

const { pool } = require('./auth');
const storage = require('../services/storage');

async function addFile(userId, { kind, filename, mime, size, content, extractedText }) {
  let storageKey = null;
  let dbContent = content;

  if (storage.isConfigured()) {
    // Bytes go to object storage; Postgres holds only the key + metadata.
    storageKey = storage.keyFor(userId, filename);
    await storage.putObject(storageKey, content, mime);
    dbContent = null;
  }

  const r = await pool.query(
    `INSERT INTO vault_files (user_id, kind, filename, mime, size_bytes, content, storage_key, extracted_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [userId, kind || 'vault', filename, mime || null, size || 0, dbContent, storageKey, extractedText || null]
  );
  return r.rows[0].id;
}

// Metadata only (no bytes) for listing. has_text flags whether Maal can read
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

// Returns { filename, mime, content } with `content` ALWAYS a Buffer, whether
// the file lives in object storage or bytea — so the download routes don't need
// to know or change. Returns null when the file doesn't exist or isn't owned by
// this user (ownership enforced in the SQL, matching the IDOR-safe pattern).
async function getFile(id, userId) {
  const r = await pool.query(
    `SELECT filename, mime, content, storage_key FROM vault_files WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  const row = r.rows[0];
  if (!row) return null;
  if (row.storage_key) {
    const content = await storage.getObject(row.storage_key);
    return { filename: row.filename, mime: row.mime, content };
  }
  return { filename: row.filename, mime: row.mime, content: row.content };
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
  // Delete the row first (ownership-scoped), then remove the object-storage blob
  // only if that row actually existed and had a key. A failed blob delete is
  // logged, not fatal: the row is already gone so the file is inaccessible, and
  // an orphaned blob is harmless.
  const r = await pool.query(
    `DELETE FROM vault_files WHERE id = $1 AND user_id = $2 RETURNING storage_key`,
    [id, userId]
  );
  const key = r.rows[0] && r.rows[0].storage_key;
  if (key) {
    try { await storage.deleteObject(key); }
    catch (e) { console.error('[vault] object delete failed (row already removed):', e.message); }
  }
}

module.exports = { addFile, listFiles, getFile, getTextById, getReadableDocs, deleteFile };
