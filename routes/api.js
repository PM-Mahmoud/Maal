// routes/api.js — JSON API for the React SPA
const express = require('express');
const router = express.Router();
const { findUserById, createUser } = require('../db/users');
const bcrypt = require('bcryptjs');
const db = require('../db/auth');

// ─── Auth ─────────────────────────────────────────────────────────────────

// GET /api/me — current session user
router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await findUserById(req.session.userId);
    if (!user) return res.status(401).json({ error: 'Not found' });
    res.json({ id: user.id, email: user.email, plan: user.plan || 'free' });
  } catch (e) {
    res.status(500).json({ user: null, error: e.message });
  }
});

// POST /api/auth/login
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const { findUserByEmail } = require('../db/users');
    const user = await findUserByEmail(email.toLowerCase().trim());
    if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    await new Promise((ok, err) => req.session.save(e => e ? err(e) : ok()));
    res.json({ user: { id: user.id, email: user.email, plan: user.plan || 'free' } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/signup
router.post('/auth/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const { findUserByEmail } = require('../db/users');
    const existing = await findUserByEmail(email.toLowerCase().trim());
    if (existing) return res.status(409).json({ error: 'Email already in use' });
    const hash = await bcrypt.hash(password, 10);
    const user = await createUser({ email: email.toLowerCase().trim(), passwordHash: hash, provider: 'email' });
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    await new Promise((ok, err) => req.session.save(e => e ? err(e) : ok()));
    res.json({ user: { id: user.id, email: user.email, plan: 'free' } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/logout
router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// ─── Score ────────────────────────────────────────────────────────────────

router.post('/v1/score/compute', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { computeMaalScore } = require('../lib/maal-score');
    // computeMaalScore takes a profile object, return empty score if no profile
    const result = { total: 0, netWorth: 0, pillars: [] };
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message, total: 0, netWorth: 0, pillars: [] });
  }
});

// ─── Markets ─────────────────────────────────────────────────────────────

router.get('/v1/markets/indices', async (req, res) => {
  try {
    const { getGlobalIndices } = require('../services/marketdata');
    const data = await getGlobalIndices();
    res.json(data || []);
  } catch { res.json([]); }
});

router.get('/v1/markets/news', async (req, res) => {
  try {
    const { getMarketNews } = require('../services/marketdata');
    const data = await getMarketNews();
    res.json(data || []);
  } catch { res.json([]); }
});

// ─── Notifications ────────────────────────────────────────────────────────

router.get('/v1/notifications', async (req, res) => {
  if (!req.session.userId) return res.json([]);
  res.json([]); // TODO: implement
});

router.post('/v1/notifications/read', (req, res) => res.json({ ok: true }));

// ─── Generic v1 CRUD (catch-all stub) ────────────────────────────────────

router.all('/v1/*', (req, res) => {
  // Return empty data for unimplemented endpoints
  const method = req.method;
  if (method === 'GET') return res.json([]);
  res.json({ ok: true });
});

module.exports = router;
