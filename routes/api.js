// routes/api.js — JSON API for the React SPA
const express = require('express');
const router = express.Router();
const { findUserById, createUser } = require('../db/users');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

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
    res.status(500).json({ error: err.message });
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
