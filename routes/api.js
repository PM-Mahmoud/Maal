// routes/api.js — JSON API for the React SPA
const express = require('express');
const router = express.Router();
const { findUserById, createUser } = require('../db/users');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const multer = require('multer');

// Vault uploads — in-memory buffer, 10MB cap (matches the EJS vault). Files are
// stored as Postgres bytea via db/vault.js, not on disk or in object storage.
const vaultUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Auth ─────────────────────────────────────────────────────────────────

router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await findUserById(req.session.userId);
    if (!user) return res.status(401).json({ error: 'Not found' });
    res.json({ id: user.id, email: user.email, plan: user.plan || 'free' });
  } catch (e) {
    console.error('/api/me error:', e.message);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

const { authLimiter } = require('../lib/rate-limiters');
const { findUserByEmail: _findUserByEmail, incrementFailedAttempts, resetFailedAttempts, recordLogin: _recordLogin } = require('../db/users');

router.post('/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const user = await _findUserByEmail(email.toLowerCase().trim());
    if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid credentials' });
    // Check account lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({ error: 'Account temporarily locked. Try again later.' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      await incrementFailedAttempts(user.id);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Enforce 2FA — don't complete login here if 2FA is enabled
    if (user.two_factor_enabled) {
      req.session.pendingEmail = user.email;
      await new Promise((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));
      return res.json({ ok: true, requires2fa: true });
    }
    await resetFailedAttempts(user.id);
    await _recordLogin(user.id, req.ip);
    // SECURITY: regenerate session ID to prevent fixation
    await new Promise((resolve, reject) => req.session.regenerate(e => e ? reject(e) : resolve()));
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    await new Promise((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));
    res.json({ user: { id: user.id, email: user.email, plan: user.plan || 'free' } });
  } catch (e) {
    console.error('/api/auth/login error:', e.message);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

router.post('/auth/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const { findUserByEmail } = require('../db/users');
    const existing = await findUserByEmail(email.toLowerCase().trim());
    if (existing) return res.status(409).json({ error: 'Email already in use' });
    const hash = await bcrypt.hash(password, 12);
    const user = await createUser({ email: email.toLowerCase().trim(), passwordHash: hash, provider: 'email' });
    await new Promise((resolve, reject) => req.session.regenerate(e => e ? reject(e) : resolve()));
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    await new Promise((ok, err) => req.session.save(e => e ? err(e) : ok()));
    res.json({ user: { id: user.id, email: user.email, plan: 'free' } });
  } catch (e) {
    console.error('/api/auth/signup error:', e.message);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// ─── Advisor (AI chat) ────────────────────────────────────────────────────

router.post('/v1/advisor/message', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const advisor = require('../services/advisor');
    if (!advisor.hasAdvisor()) {
      return res.json({
        reply: "I'm not able to respond right now — the AI advisor isn't configured. Ask your admin to set an API key (AZURE_OPENAI_API_KEY or GROQ_API_KEY) in the server environment.",
        live: false,
      });
    }
    const { findUserById } = require('../db/users');
    const user = await findUserById(req.session.userId);
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const clean = [
      ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];
    const reply = await advisor.complete(clean, { userId: req.session.userId });
    res.json({ ok: true, reply, live: true });
  } catch (err) {
    console.error('advisor message error:', err.message);
    res.status(500).json({ reply: 'The advisor hit a snag — try again in a moment.', live: false });
  }
});

router.get('/v1/advisor/status', (req, res) => {
  const advisor = require('../services/advisor');
  res.json({ live: advisor.hasAdvisor() });
});

// ─── Basiq (open banking) ─────────────────────────────────────────────────

router.get('/v1/basiq/status', async (req, res) => {
  if (!req.session.userId) return res.json({ connected: false, live: false });
  try {
    const basiq = require('../services/basiq');
    const { findUserById } = require('../db/users');
    const user = await findUserById(req.session.userId);
    res.json({ connected: !!user.basiq_user_id, live: basiq.hasBasiq() });
  } catch { res.json({ connected: false, live: false }); }
});

// POST /api/v1/basiq/sync — trigger account + transaction sync, return JSON
router.post('/v1/basiq/sync', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const basiq = require('../services/basiq');
    const { findUserById } = require('../db/users');
    const { addAccount, deleteAccount, getAccountsByUserId } = require('../db/linked_accounts');
    const { upsertBasiqTransactions } = require('../db/transactions');
    const user = await findUserById(req.session.userId);
    if (!user.basiq_user_id) return res.status(400).json({ error: 'No Basiq account linked. Visit /basiq/connect first.' });
    const accounts = await basiq.getAccounts(user.basiq_user_id);
    const existing = await getAccountsByUserId(req.session.userId);
    for (const acc of existing) {
      if (acc.account_reference && String(acc.account_reference).startsWith('basiq:')) {
        await deleteAccount(acc.id, req.session.userId);
      }
    }
    for (const acc of accounts) {
      await addAccount(req.session.userId, {
        institution_name: (acc.institution || acc.name || 'Bank account').replace('AU', ''),
        institution_type: acc.class?.type || 'bank',
        account_reference: 'basiq:' + acc.id,
        balance: Math.round(Number(acc.balance) || 0),
      });
    }
    // Mirror to cash_accounts so dashboard numbers pick them up
    await pool.query(`DELETE FROM cash_accounts WHERE user_id = $1 AND source = 'basiq'`, [req.session.userId]);
    for (const acc of accounts) {
      await pool.query(
        `INSERT INTO cash_accounts (user_id, label, institution, balance, source, account_reference)
         VALUES ($1, $2, $3, $4, 'basiq', $5)
         ON CONFLICT (account_reference) DO UPDATE SET balance = EXCLUDED.balance, updated_at = NOW()`,
        [req.session.userId, acc.name || 'Bank account', (acc.institution || '').replace('AU', ''), Math.round(Number(acc.balance) || 0), 'basiq:' + acc.id]
      );
    }
    try {
      const txns = await basiq.getTransactions(user.basiq_user_id, 100);
      await upsertBasiqTransactions(req.session.userId, txns);
    } catch (e) { console.error('Basiq txn sync failed:', e.message); }
    res.json({ ok: true, accounts: accounts.length });
  } catch (err) {
    console.error('basiq sync error:', err.message);
    res.status(500).json({ error: 'Sync failed. Please try again.' });
  }
});

// ─── Markets ─────────────────────────────────────────────────────────────

router.get('/v1/markets/indices', async (req, res) => {
  try {
    const { getGlobalIndices } = require('../services/marketdata');
    res.json(await getGlobalIndices() || []);
  } catch { res.json([]); }
});

router.get('/v1/markets/news', async (req, res) => {
  try {
    const { getMarketNews } = require('../services/marketdata');
    res.json(await getMarketNews() || []);
  } catch { res.json([]); }
});

// ─── Notifications ────────────────────────────────────────────────────────

router.get('/v1/notifications', async (req, res) => {
  if (!req.session.userId) return res.json([]);
  res.json([]);
});
router.post('/v1/notifications/read', (_req, res) => res.json({ ok: true }));

// ─── Maal Score (authoritative — same engine as the EJS dashboard) ─────────
// GET /api/v1/score → { ok, score, band, pillars, hasData, history }
// Computes the real Maal Score for the logged-in user via lib/maal-score.js
// over the MERGED effective profile (flat user_profiles columns folded with the
// granular asset tables) — identical to GET /dashboard and /dashboard/api/maal-score,
// so the React and EJS dashboards can never disagree. History (oldest-first) comes
// from financial_scores (score_type='maal_score'). Registered before /v1/:table so
// it isn't swallowed as a generic stub.
router.get('/v1/score', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { getProfileByUserId } = require('../db/profiles');
    const assetsDb = require('../db/assets');
    const { computeMaalScore } = require('../lib/maal-score');
    const { getScoresByUserId, shapeScoreHistory } = require('../db/scores');

    const profile = (await getProfileByUserId(req.session.userId)) || {};
    const assetSummary = await assetsDb.getAssetSummary(req.session.userId);
    const effectiveProfile = assetsDb.mergeAssetSummaryIntoProfile(profile, assetSummary);
    const score = computeMaalScore(effectiveProfile);

    let history = [];
    try {
      const rows = await getScoresByUserId(req.session.userId, 60);
      history = shapeScoreHistory(rows, 'maal_score');
    } catch (e) {
      // History is best-effort — never fail the live score on a history read.
      console.error('/api/v1/score history error:', e.message);
    }

    res.json({ ok: true, ...score, history });
  } catch (e) {
    console.error('/api/v1/score error:', e.message);
    res.status(500).json({ ok: false, error: 'Could not compute score' });
  }
});

// ─── Profile (real — over db/profiles.js / user_profiles) ──────────────────
// React models a profile with display_name / age_band / risk (no dedicated
// columns — stored in onboarding_data JSONB) plus real financial columns.
// GET returns the normalized flat object; PATCH is a partial update that never
// clobbers unspecified fields. Both scoped to the session user. Registered
// before /v1/:table so 'profile' isn't treated as a generic (stub) table, and
// so the deliberately-excluded raw user_profiles table stays off the generic API.
router.get('/v1/profile', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { getProfileByUserId, normalizeProfile } = require('../db/profiles');
    const { findUserById } = require('../db/users');
    const [row, user] = await Promise.all([
      getProfileByUserId(req.session.userId),
      findUserById(req.session.userId),
    ]);
    res.json(normalizeProfile(row, user));
  } catch (e) {
    console.error('/api/v1/profile GET error:', e.message);
    res.status(500).json({ error: 'Could not load profile' });
  }
});

router.patch('/v1/profile', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { patchProfile, normalizeProfile } = require('../db/profiles');
    const { findUserById } = require('../db/users');
    const row = await patchProfile(req.session.userId, req.body || {});
    const user = await findUserById(req.session.userId);
    res.json(normalizeProfile(row, user));
  } catch (e) {
    console.error('/api/v1/profile PATCH error:', e.message);
    res.status(500).json({ error: 'Could not save profile' });
  }
});

// ─── Net-worth snapshots (real history for the dashboard tiles/charts) ─────
// GET /api/v1/snapshots?days=N → oldest-first daily series. Upserts today's
// snapshot first (from the merged effective profile) so React-only users accrue
// history just like the EJS dashboard does. Registered before /v1/:table.
router.get('/v1/snapshots', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { getProfileByUserId } = require('../db/profiles');
    const assetsDb = require('../db/assets');
    const { recordSnapshot, getSnapshots, snapshotValuesFromProfile } = require('../db/snapshots');

    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 366, 1), 3660);

    const profile = (await getProfileByUserId(req.session.userId)) || {};
    const assetSummary = await assetsDb.getAssetSummary(req.session.userId);
    const effectiveProfile = assetsDb.mergeAssetSummaryIntoProfile(profile, assetSummary);

    try {
      await recordSnapshot(req.session.userId, snapshotValuesFromProfile(effectiveProfile));
    } catch (e) {
      // Recording is best-effort (e.g. pre-migration) — still return any history.
      console.error('/api/v1/snapshots record error:', e.message);
    }

    const rows = await getSnapshots(req.session.userId, days);
    res.json(rows.map((r) => ({
      date: r.snap_date,
      netWorth: Number(r.net_worth) || 0,
      assets: Number(r.assets_total) || 0,
      super: Number(r.super_balance) || 0,
      investments: Number(r.invest_balance) || 0,
      debts: Number(r.debts_total) || 0,
      cash: Number(r.cash_balance) || 0,
    })));
  } catch (e) {
    console.error('/api/v1/snapshots error:', e.message);
    res.status(500).json({ error: 'Could not load snapshots' });
  }
});

// ─── Vault (real document storage — Postgres bytea via db/vault.js) ────────
// The React vault page used a Supabase Storage bucket that doesn't exist (the
// adapter has no .storage), so uploads threw and list/delete hit stubs. These
// endpoints store the actual bytes server-side, scoped to req.session.userId.
// Registered before /v1/:table.
const VAULT_ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword', 'text/plain', 'text/csv',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
]);

// GET /api/v1/vault → metadata list mapped to the React Doc shape.
router.get('/v1/vault', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const vaultDb = require('../db/vault');
    const files = await vaultDb.listFiles(req.session.userId, 'vault');
    res.json(files.map((f) => ({
      id: String(f.id),
      filename: f.filename,
      storage_path: '',
      size_bytes: Number(f.size_bytes) || 0,
      created_at: f.created_at,
      collection: 'My Documents', // folders not persisted yet (backlog)
      extracted: f.has_text ? { document_type: 'Readable' } : null,
    })));
  } catch (e) {
    console.error('/api/v1/vault GET error:', e.message);
    res.status(500).json({ error: 'Could not list documents' });
  }
});

// POST /api/v1/vault (multipart, field "file") → store bytes + extracted text.
// Auth is checked BEFORE multer so an unauthenticated request can't make the
// server buffer a 10MB upload.
router.post('/v1/vault',
  (req, res, next) => (req.session.userId ? next() : res.status(401).json({ error: 'Not authenticated' })),
  vaultUpload.single('file'),
  async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file received.' });
    const vaultDb = require('../db/vault');
    const { extractText } = require('../services/extract');
    let extractedText = '';
    try { extractedText = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname); }
    catch (e) { console.error('vault extract on upload failed:', e.message); }
    const safeMime = VAULT_ALLOWED_MIME.has(req.file.mimetype) ? req.file.mimetype : 'application/octet-stream';
    const id = await vaultDb.addFile(req.session.userId, {
      kind: 'vault',
      filename: String(req.file.originalname || 'document').slice(0, 255),
      mime: safeMime,
      size: req.file.size,
      content: req.file.buffer,
      extractedText,
    });
    res.json({ ok: true, id: String(id), filename: req.file.originalname, size_bytes: req.file.size, hasText: !!extractedText });
  } catch (err) {
    console.error('/api/v1/vault POST error:', err.message);
    res.status(500).json({ error: 'Upload failed.' });
  }
});

// GET /api/v1/vault/:id → download (forced attachment to avoid inline XSS).
router.get('/v1/vault/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const vaultDb = require('../db/vault');
    const f = await vaultDb.getFile(req.params.id, req.session.userId);
    if (!f) return res.status(404).json({ error: 'File not found' });
    const safeFilename = (f.filename || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.send(f.content);
  } catch (err) {
    console.error('/api/v1/vault/:id GET error:', err.message);
    res.status(500).json({ error: 'Could not load the file.' });
  }
});

// DELETE /api/v1/vault/:id → ownership-scoped delete.
router.delete('/v1/vault/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const vaultDb = require('../db/vault');
    await vaultDb.deleteFile(req.params.id, req.session.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('/api/v1/vault/:id DELETE error:', err.message);
    res.status(500).json({ error: 'Could not delete the file.' });
  }
});

// POST /api/v1/vault/:id/extract → propose profile figures from the doc text.
router.post('/v1/vault/:id/extract', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const vaultDb = require('../db/vault');
    const advisor = require('../services/advisor');
    const doc = await vaultDb.getTextById(req.params.id, req.session.userId);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    if (!doc.extracted_text) {
      return res.json({ ok: true, fields: [], reason: 'no-text' });
    }
    if (!advisor.hasAdvisor()) {
      return res.json({ ok: true, fields: [], reason: 'ai-unavailable' });
    }
    const { fields, reason } = await advisor.extractFigures(doc.extracted_text);
    res.json({ ok: true, fields: fields || [], reason, filename: doc.filename });
  } catch (err) {
    console.error('/api/v1/vault/:id/extract error:', err.message);
    res.status(500).json({ error: 'Could not read that document.' });
  }
});

// ─── Generic CRUD for user-scoped asset tables ────────────────────────────
//
// Tables the React SPA reads/writes. Every row is scoped to user_id.
// Filters from QueryBuilder arrive as ?filter=col=op.val
// Multiple filters sent as repeated ?filter= params.

const ASSET_TABLES = new Set([
  'cash_accounts', 'investments', 'properties', 'debts',
  'super_accounts', 'incomes', 'other_assets',
  'linked_accounts', 'goals', 'transactions',
  // BUG-5 FIX: 'profiles' table does not exist; the correct table is 'user_profiles'
  // 'user_profiles' is intentionally not in the generic API (profile updates go through /dashboard/profile)
  'score_snapshots',
]);

function parseFilters(raw) {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const clauses = [];
  const vals = [];
  for (const f of list) {
    // col=op.val  or  col=in.(v1,v2)
    const m = f.match(/^(\w+)=(eq|neq|gte|lte|is|in|not)\.(.+)$/);
    if (!m) continue;
    const [, col, op, val] = m;
    const safe = /^\w+$/.test(col) ? col : null;
    if (!safe) continue;
    if (op === 'eq')  { clauses.push(`${col} = $${vals.length + 2}`); vals.push(val); }
    else if (op === 'neq') { clauses.push(`${col} != $${vals.length + 2}`); vals.push(val); }
    else if (op === 'gte') { clauses.push(`${col} >= $${vals.length + 2}`); vals.push(val); }
    else if (op === 'lte') { clauses.push(`${col} <= $${vals.length + 2}`); vals.push(val); }
    else if (op === 'is')  { clauses.push(val === 'null' ? `${col} IS NULL` : `${col} IS NOT NULL`); }
    else if (op === 'in')  {
      const items = val.replace(/^\(/, '').replace(/\)$/, '').split(',').map(s => s.trim()).filter(Boolean);
      if (!items.length) continue;
      const ph = items.map((_, i) => `$${vals.length + i + 2}`).join(', ');
      clauses.push(`${col} IN (${ph})`);
      vals.push(...items);
    }
  }
  return { where: clauses.length ? ' AND ' + clauses.join(' AND ') : '', vals };
}

router.all('/v1/:table', async (req, res) => {
  const { table } = req.params;
  if (!ASSET_TABLES.has(table)) {
    // Unknown table — safe stub
    if (req.method === 'GET') return res.json([]);
    if (req.method === 'DELETE') return res.json({ ok: true });
    return res.json({ ok: true, id: `stub-${Date.now()}` });
  }
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });

  const uid = req.session.userId;
  const ucol = 'user_id';
  const raw = req.query.filter;
  const { where, vals } = parseFilters(raw);
  const isSingle = req.query.single === '1';

  try {
    if (req.method === 'GET') {
      let q = `SELECT * FROM ${table} WHERE ${ucol} = $1${where} ORDER BY id ASC`;
      if (req.query.limit) q += ` LIMIT ${parseInt(req.query.limit, 10) || 100}`;
      const { rows } = await pool.query(q, [uid, ...vals]);
      return res.json(isSingle ? (rows[0] || null) : rows);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      body[ucol] = uid;
      const keys = Object.keys(body).filter(k => /^\w+$/.test(k));
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await pool.query(
        `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        keys.map(k => body[k])
      );
      return res.json(rows[0] || { ok: true });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      delete body[ucol]; // never let client override user_id
      const keys = Object.keys(body).filter(k => /^\w+$/.test(k));
      if (!keys.length) return res.json({ ok: true });
      const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      // BUG-3 FIX: rebuild filter placeholders offset after SET params to avoid collisions
      // SET uses $2..$N+1 (N body keys, $1=uid). Filters start at $N+2.
      const rawFilters = Array.isArray(raw) ? raw : raw ? [raw] : [];
      const filterClauses = [];
      const filterVals = [];
      for (const f of rawFilters) {
        const m = f.match(/^(\w+)=(eq|neq|gte|lte|is|in|not)\.(.+)$/);
        if (!m) continue;
        const [, col, op, val] = m;
        if (!/^\w+$/.test(col)) continue;
        const idx = keys.length + 2 + filterVals.length;
        if (op === 'eq')  { filterClauses.push(`${col} = $${idx}`); filterVals.push(val); }
        else if (op === 'neq') { filterClauses.push(`${col} != $${idx}`); filterVals.push(val); }
        else if (op === 'gte') { filterClauses.push(`${col} >= $${idx}`); filterVals.push(val); }
        else if (op === 'lte') { filterClauses.push(`${col} <= $${idx}`); filterVals.push(val); }
        else if (op === 'is')  { filterClauses.push(val === 'null' ? `${col} IS NULL` : `${col} IS NOT NULL`); }
        else if (op === 'in')  {
          const items = val.replace(/^\(/, '').replace(/\)$/, '').split(',').map(s => s.trim()).filter(Boolean);
          if (!items.length) continue;
          const ph = items.map((_, i) => `$${idx + i}`).join(', ');
          filterClauses.push(`${col} IN (${ph})`);
          filterVals.push(...items);
        }
      }
      const whereExtra = filterClauses.length ? ' AND ' + filterClauses.join(' AND ') : '';
      const { rows } = await pool.query(
        `UPDATE ${table} SET ${setClause}, updated_at = NOW() WHERE ${ucol} = $1${whereExtra} RETURNING *`,
        [uid, ...keys.map(k => body[k]), ...filterVals]
      );
      return res.json(isSingle ? (rows[0] || null) : rows);
    }

    if (req.method === 'DELETE') {
      await pool.query(`DELETE FROM ${table} WHERE ${ucol} = $1${where}`, [uid, ...vals]);
      return res.json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(`api /v1/${table} ${req.method} error:`, e.message);
    if (req.method === 'GET') return res.json([]);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

// Catch-all for unknown sub-paths (e.g. /v1/foo/bar)
router.all('/v1/*', (req, res) => {
  if (req.method === 'GET') return res.json([]);
  if (req.method === 'DELETE') return res.json({ ok: true });
  return res.json({ ok: true, id: `stub-${Date.now()}` });
});

module.exports = router;
