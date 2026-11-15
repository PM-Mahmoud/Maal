'use strict';
// services/account-deletion.js
// Permanent account erasure, called from Settings → Delete account
// (POST /api/account/delete in routes/auth.js, after session + typed
// confirmation checks).
//
// The Postgres side is already engineered for erasure: every per-user table
// cascades from users(id) (immutability triggers explicitly allow the cascade,
// see migrations 1753900000000 / 1755500000000 and the DB contract in
// test/financial-integrity-db.test.js). This service adds what the bare
// `DELETE FROM users` used to miss:
//
//   1. Active Stripe subscriptions are cancelled FIRST. If that fails we stop
//      and delete nothing — erasing the account while billing carries on would
//      leave the person paying for an account they can no longer reach.
//   2. Vault files held in object storage (R2/S3) are removed. The DB cascade
//      only drops the vault_files rows, which would orphan the uploaded
//      documents (statements, payslips — PII) in the bucket.
//   3. Every other signed-in session for the user (other devices) is purged
//      from the session store, not just the current one.
//
// Dependencies are injected so test/account-deletion.test.js can prove the
// ordering and failure behaviour without a database, Stripe or a bucket.
// Nothing here logs user PII — only counts.

async function defaultDeps() {
  const pool = require('../db/pool');
  const storage = require('./storage');
  let stripe = null;
  if (process.env.STRIPE_SECRET_KEY) {
    try { stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); } catch { stripe = null; }
  }
  return { pool, stripe, storage: storage.isConfigured() ? storage : null };
}

const CANCELLABLE = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete']);

/**
 * Erase a user's account. Returns a summary of what was cleaned up.
 * Throws with err.code = 'billing_cancel_failed' when Stripe could not cancel
 * an active subscription (nothing is deleted in that case).
 */
async function deleteAccount(userId, deps) {
  const { pool, stripe, storage, log = console } = deps || (await defaultDeps());
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid user id');

  // ── 1. Billing ────────────────────────────────────────────────────────────
  const { rows: userRows } = await pool.query(
    'SELECT stripe_customer_id FROM users WHERE id = $1', [id]
  );
  if (!userRows.length) return { deleted: false, reason: 'not_found' };
  const customerId = userRows[0].stripe_customer_id;

  let subscriptionsCancelled = 0;
  if (customerId && stripe) {
    try {
      const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 });
      for (const sub of subs.data || []) {
        if (!CANCELLABLE.has(sub.status)) continue;
        await stripe.subscriptions.cancel(sub.id);
        subscriptionsCancelled += 1;
      }
    } catch (e) {
      log.error('[account-deletion] Stripe cancellation failed; account NOT deleted:', e.message);
      const err = new Error('Could not cancel the subscription');
      err.code = 'billing_cancel_failed';
      throw err;
    }
  }

  // ── 2. Collect object-storage keys before the cascade drops the rows ───────
  const { rows: fileRows } = await pool.query(
    'SELECT storage_key FROM vault_files WHERE user_id = $1 AND storage_key IS NOT NULL', [id]
  );

  // ── 3. Delete the user (cascades to every per-user table) ─────────────────
  await pool.query('DELETE FROM users WHERE id = $1', [id]);

  // ── 4. Sign out every other device ────────────────────────────────────────
  let sessionsPurged = 0;
  try {
    const r = await pool.query(
      `DELETE FROM session WHERE sess->>'userId' = $1`, [String(id)]
    );
    sessionsPurged = r.rowCount || 0;
  } catch (e) {
    log.error('[account-deletion] session purge failed:', e.message);
  }

  // ── 5. Remove stored documents (best effort; the rows are already gone) ───
  let filesRemoved = 0;
  let filesFailed = 0;
  if (storage && fileRows.length) {
    for (const { storage_key: key } of fileRows) {
      try { await storage.deleteObject(key); filesRemoved += 1; } catch { filesFailed += 1; }
    }
    if (filesFailed) log.error(`[account-deletion] ${filesFailed} stored file(s) could not be removed`);
  }

  return { deleted: true, subscriptionsCancelled, sessionsPurged, filesRemoved, filesFailed };
}

module.exports = { deleteAccount, CANCELLABLE };
