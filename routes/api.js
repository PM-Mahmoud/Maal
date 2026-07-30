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

// ─── Usage metering (specs/silvia-parity-tier1-2.md, decision 10) ──────────
// Count-based per-feature limits by plan, reset on the 1st. Free tier = 0 AI
// usage (launch cost guardrail) — gated endpoints return 402 with an upgrade
// message, and the client renders it as a prompt, never an error.

const planLimits = require('../lib/plan-limits');
const usageDb = require('../db/usage');

function send402(res, plan, feature, limit, used) {
  res.status(402).json({
    error: planLimits.upgradeMessage(plan, feature),
    code: 'usage_limit',
    upgrade: true,
    upgradeUrl: '/app/billing',
    feature,
    plan: planLimits.normalizePlan(plan),
    limit,
    used,
  });
}

// Check + atomically consume one use of a monthly AI feature. Sends the 402
// itself and returns null when over the limit; otherwise returns { user }.
// The check-and-consume is a single atomic DB op (incrementIfUnder) so two
// concurrent requests can't both slip past the cap. Fails OPEN on infrastructure
// errors — availability wins, and the failure is logged.
async function gateMonthlyAiUsage(req, res, feature) {
  const user = await findUserById(req.session.userId);
  const plan = planLimits.normalizePlan(user && user.plan);
  const limit = planLimits.limitFor(plan, feature);
  if (limit <= 0) { // Free tier (0) — deny without touching the DB.
    send402(res, plan, feature, limit, 0);
    return null;
  }
  try {
    const newCount = await usageDb.incrementIfUnder(req.session.userId, feature, limit);
    if (newCount === null) {
      send402(res, plan, feature, limit, limit);
      return null;
    }
  } catch (e) {
    console.error('[usage] metering failed open for ' + feature + ':', e.message);
  }
  return { user };
}

// GET /api/v1/usage — plan + per-feature usage for the current period.
router.get('/v1/usage', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await findUserById(req.session.userId);
    const plan = planLimits.normalizePlan(user && user.plan);
    const period = planLimits.periodKey();
    const [counts, activeRadars] = await Promise.all([
      usageDb.getCounts(req.session.userId),
      usageDb.countActiveRadars(req.session.userId).catch(() => 0),
    ]);
    const features = {};
    planLimits.MONTHLY_FEATURES.forEach((f) => {
      features[f] = { used: counts[f] || 0, limit: planLimits.limitFor(plan, f) };
    });
    features.active_radars = { used: activeRadars, limit: planLimits.limitFor(plan, 'active_radars') };
    const now = new Date();
    const resetsOn = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
    res.json({ plan, period, resetsOn, features });
  } catch (e) {
    console.error('/api/v1/usage error:', e.message);
    res.status(500).json({ error: 'Could not load usage' });
  }
});

// ─── Advisor (AI chat) ────────────────────────────────────────────────────

router.post('/v1/advisor/message', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const advisor = require('../services/advisor');
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    if (!advisor.hasAdvisor()) {
      return res.json({
        reply: "I'm not able to respond right now — the AI advisor isn't configured. Ask your admin to set an API key (AZURE_OPENAI_API_KEY or GROQ_API_KEY) in the server environment.",
        live: false,
      });
    }

    // Metering: consume one advisor message (402 + upgrade prompt when over).
    const gate = await gateMonthlyAiUsage(req, res, 'advisor_messages');
    if (!gate) return;

    // Feed the advisor the SAME dashboard context the EJS /dashboard/ask/message
    // uses: merged effective profile, Maal Score, Vault docs, 30d transactions,
    // 90d net-worth snapshots, goals, cash runway. Without this the React Ask Maal
    // had no access to the user's financial data (advisor.complete = raw model).
    const { getProfileByUserId } = require('../db/profiles');
    const assetsDb = require('../db/assets');
    const { computeMaalScore } = require('../lib/maal-score');
    const vaultDb = require('../db/vault');
    const { getTxnsSince } = require('../db/transactions');
    const { getSnapshots } = require('../db/snapshots');
    const goalsDb = require('../db/goals');
    const isaacus = require('../services/isaacus');

    const user = await findUserById(req.session.userId);
    const rawProfile = (await getProfileByUserId(req.session.userId)) || {};
    const assetSummary = await assetsDb.getAssetSummary(req.session.userId);
    const profile = assetsDb.mergeAssetSummaryIntoProfile(rawProfile, assetSummary);
    const maal = computeMaalScore(profile);

    let docs = [];
    try { docs = await vaultDb.getReadableDocs(req.session.userId); }
    catch (e) { console.error('vault docs for advisor failed:', e.message); }

    const [txns, snaps, goals] = await Promise.all([
      getTxnsSince(req.session.userId, 30).catch(() => []),
      getSnapshots(req.session.userId, 90).catch(() => []),
      goalsDb.listGoals(req.session.userId).catch(() => []),
    ]);
    const cashSavings = Number(profile.cash_savings || 0);
    const monthlyExpenses = Number(profile.monthly_expenses || 0);
    const cashRunway = monthlyExpenses > 0 ? Math.round(cashSavings / monthlyExpenses) : null;

    // Legal/tax grounding from the user's own Vault docs (only when they have any).
    let isaacusGrounding = null;
    if (isaacus.hasIsaacus() && docs.length) {
      try {
        if ((await isaacus.classifyLegalIntent(message)) >= 0.35) {
          const answer = await isaacus.extractAnswer(message, docs.map((d) => d.extracted_text));
          if (answer) isaacusGrounding = { text: answer.text, score: answer.score, filename: docs[answer.sourceIndex] ? docs[answer.sourceIndex].filename : null };
        }
      } catch (e) { console.error('[isaacus] grounding lookup failed:', e.message); }
    }

    const clean = [
      ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    // Cross-session memory + the user's custom instructions, injected into the prompt.
    const memoryDb = require('../db/advisor-memory');
    let memoryRow = { content: '', last_merged_at: null };
    let customInstructions = '';
    try {
      [memoryRow, customInstructions] = await Promise.all([
        memoryDb.getMemory(req.session.userId),
        memoryDb.getCustomInstructions(req.session.userId),
      ]);
    } catch (e) { console.error('[advisor] memory/instructions load failed:', e.message); }

    const extra = { transactions: txns, snapshots: snaps, goals, cashRunway, isaacusGrounding, memory: memoryRow.content, customInstructions };
    // Rich web chat: reply text + generative-UI widgets (filled with the user's
    // real data server-side) + follow-up chips + internal-only citations.
    const rich = await advisor.chatRich(user, profile, maal, clean, docs, extra);
    res.json({ ok: true, reply: rich.reply, widgets: rich.widgets, followUps: rich.followUps, citations: rich.citations, live: rich.live });

    // Deferred memory merge (after the response is flushed, debounced) — updates
    // the user's memory from this turn without adding latency to the reply.
    const memoryService = require('../services/advisor-memory');
    if (rich.live && memoryService.shouldMerge(memoryRow.last_merged_at)) {
      setImmediate(async () => {
        try {
          const transcript = memoryService.transcriptFromMessages([...clean, { role: 'assistant', content: rich.reply }]);
          const updated = await memoryService.mergeMemory(memoryRow.content, transcript);
          if (updated) await memoryDb.saveMemory(req.session.userId, updated);
        } catch (e) { console.error('[advisor] deferred memory merge failed:', e.message); }
      });
    }
  } catch (err) {
    console.error('advisor message error:', err.message);
    res.status(500).json({ reply: 'The advisor hit a snag — try again in a moment.', live: false });
  }
});

// ─── Advisor memory + custom instructions (inspect / edit / clear) ─────────
router.get('/v1/advisor/memory', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const memoryDb = require('../db/advisor-memory');
    const [mem, instructions] = await Promise.all([
      memoryDb.getMemory(req.session.userId),
      memoryDb.getCustomInstructions(req.session.userId),
    ]);
    res.json({ memory: mem.content || '', updatedAt: mem.updated_at || null, customInstructions: instructions });
  } catch (e) {
    console.error('/api/v1/advisor/memory GET error:', e.message);
    res.status(500).json({ error: 'Could not load memory' });
  }
});

// PUT { memory?, customInstructions? } — edit either. DELETE clears memory only.
router.put('/v1/advisor/memory', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const memoryDb = require('../db/advisor-memory');
    const d = (req.body && req.body.data && typeof req.body.data === 'object') ? req.body.data : (req.body || {});
    if (typeof d.memory === 'string') await memoryDb.saveMemory(req.session.userId, d.memory);
    if (typeof d.customInstructions === 'string') await memoryDb.setCustomInstructions(req.session.userId, d.customInstructions);
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/v1/advisor/memory PUT error:', e.message);
    res.status(500).json({ error: 'Could not save' });
  }
});

router.delete('/v1/advisor/memory', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const memoryDb = require('../db/advisor-memory');
    await memoryDb.clearMemory(req.session.userId);
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/v1/advisor/memory DELETE error:', e.message);
    res.status(500).json({ error: 'Could not clear memory' });
  }
});

router.get('/v1/advisor/status', (req, res) => {
  const advisor = require('../services/advisor');
  res.json({ live: advisor.hasAdvisor() });
});

// ─── Dashboard widgets saved from Ask Maal (generative UI) ─────────────────
// Saved widgets store only their SOURCE — data is recomputed live here from the
// user's current financial data (same context as the advisor), so a saved chart
// stays fresh and never shows a stale snapshot.
async function buildWidgetContext(userId) {
  const { getProfileByUserId } = require('../db/profiles');
  const assetsDb = require('../db/assets');
  const { computeMaalScore } = require('../lib/maal-score');
  const { getTxnsSince } = require('../db/transactions');
  const { getSnapshots } = require('../db/snapshots');
  const goalsDb = require('../db/goals');
  const rawProfile = (await getProfileByUserId(userId)) || {};
  const assetSummary = await assetsDb.getAssetSummary(userId);
  const profile = assetsDb.mergeAssetSummaryIntoProfile(rawProfile, assetSummary);
  const maal = computeMaalScore(profile);
  const [transactions, snapshots, goals] = await Promise.all([
    getTxnsSince(userId, 30).catch(() => []),
    getSnapshots(userId, 90).catch(() => []),
    goalsDb.listGoals(userId).catch(() => []),
  ]);
  return { profile, maal, transactions, snapshots, goals };
}

router.get('/v1/widgets', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const widgetsDb = require('../db/widgets');
    const { renderSaved } = require('../services/advisor-widgets');
    const saved = await widgetsDb.listWidgets(req.session.userId);
    if (!saved.length) return res.json({ widgets: [] });
    const ctx = await buildWidgetContext(req.session.userId);
    const widgets = saved
      .map((w) => {
        const spec = renderSaved(w.source, w.title, ctx);
        return spec ? { id: w.id, ...spec } : null;
      })
      .filter(Boolean);
    res.json({ widgets });
  } catch (e) {
    console.error('/api/v1/widgets GET error:', e.message);
    res.status(500).json({ error: 'Could not load widgets' });
  }
});

router.post('/v1/widgets', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const widgetsDb = require('../db/widgets');
    const { isKnownSource } = require('../services/advisor-widgets');
    const d = (req.body && req.body.data && typeof req.body.data === 'object') ? req.body.data : (req.body || {});
    const source = String(d.source || '');
    if (!isKnownSource(source)) return res.status(400).json({ error: 'Unknown widget source.' });
    const id = await widgetsDb.addWidget(req.session.userId, source, d.title);
    res.json({ ok: true, id });
  } catch (e) {
    console.error('/api/v1/widgets POST error:', e.message);
    res.status(500).json({ error: 'Could not save widget' });
  }
});

router.delete('/v1/widgets/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const widgetsDb = require('../db/widgets');
    await widgetsDb.removeWidget(req.params.id, req.session.userId);
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/v1/widgets DELETE error:', e.message);
    res.status(500).json({ error: 'Could not remove widget' });
  }
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

// Latest persisted integrity result. This route is deliberately registered
// before the generic /v1/:table handler and is always scoped to the session.
router.get('/v1/data-health', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const quality = require('../services/data-quality');
    res.json(await quality.getDataHealth(req.session.userId));
  } catch (error) {
    console.error('/api/v1/data-health error:', error.message);
    res.status(500).json({ error: 'Could not load financial data health.' });
  }
});

router.get(
  '/v1/calculation-lineage',
  require('../services/calculation-lineage').listLineageHandler
);

router.get(
  '/v1/background-jobs',
  require('../services/background-jobs').listJobsHandler
);

router.get(
  '/v1/reconciliations',
  require('../services/reconciliation').listReconciliationsHandler
);

// POST /api/v1/basiq/sync — trigger account + transaction sync, return JSON
router.post('/v1/basiq/sync', async (req, res) => {
  return require('../services/imports').enqueueBasiqImportHandler(req, res);
});

router.get('/v1/import-runs/:id', require('../services/imports').getImportRunHandler);

router.get(
  '/v1/connection-health',
  require('../services/connection-health').connectionHealthHandler
);

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

// Upcoming earnings for the tickers the user holds in `investments`.
router.get('/v1/markets/earnings', async (req, res) => {
  if (!req.session.userId) return res.json([]);
  try {
    const { getUpcomingEarnings } = require('../services/marketdata');
    const { rows } = await pool.query(
      `SELECT DISTINCT ticker FROM investments WHERE user_id = $1 AND ticker IS NOT NULL AND ticker <> ''`,
      [req.session.userId]
    );
    res.json(await getUpcomingEarnings(rows.map((r) => r.ticker)));
  } catch (e) {
    console.error('/api/v1/markets/earnings error:', e.message);
    res.json([]);
  }
});

// ─── Notifications ────────────────────────────────────────────────────────

router.get('/v1/notifications', async (req, res) => {
  if (!req.session.userId) return res.json([]);
  res.json([]);
});
router.post('/v1/notifications/read', (_req, res) => res.json({ ok: true }));

// Notification preferences (PR 10) — currently the daily portfolio digest opt-in.
// Whitelisted keys only, stored in users.notification_prefs JSONB.
const NOTIFICATION_PREF_KEYS = new Set(['daily_digest', 'radar_email', 'radar_sms']);

router.get('/v1/notification-prefs', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await findUserById(req.session.userId);
    const prefs = (user && user.notification_prefs) || {};
    res.json({ daily_digest: prefs.daily_digest === true, ...prefs });
  } catch (e) {
    console.error('/api/v1/notification-prefs GET error:', e.message);
    res.json({ daily_digest: false });
  }
});

router.post('/v1/notification-prefs', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const d = (req.body && req.body.data && typeof req.body.data === 'object') ? req.body.data : (req.body || {});
    const key = String(d.key || '');
    if (!NOTIFICATION_PREF_KEYS.has(key)) return res.status(400).json({ error: 'Unknown preference.' });
    const { setNotificationPref } = require('../db/users');
    await setNotificationPref(req.session.userId, key, !!d.value);
    res.json({ ok: true, key, value: !!d.value });
  } catch (e) {
    console.error('/api/v1/notification-prefs POST error:', e.message);
    res.status(500).json({ error: 'Could not update preference.' });
  }
});

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
    const { recordScoreSnapshot, getScoreSnapshots, shapeScoreSnapshotHistory } = require('../db/score-snapshots');

    const profile = (await getProfileByUserId(req.session.userId)) || {};
    const assetSummary = await assetsDb.getAssetSummary(req.session.userId);
    const effectiveProfile = assetsDb.mergeAssetSummaryIntoProfile(profile, assetSummary);
    const score = computeMaalScore(effectiveProfile);
    try {
      await require('../services/calculation-lineage').recordScoreMetric(
        req.session.userId, score, effectiveProfile
      );
    } catch (e) {
      console.error('/api/v1/score lineage error:', e.message);
    }

    // Record today's score (upsert, at most one row/user/day) so the React
    // dashboard accrues a real daily history. Best-effort: recording or reading
    // history must never fail the live score. Only persist once the user has
    // actual data, so an empty profile doesn't seed a flat zero line.
    let history = [];
    if (score.hasData) {
      try {
        await recordScoreSnapshot(req.session.userId, score);
      } catch (e) {
        console.error('/api/v1/score record error:', e.message);
      }
    }
    try {
      const rows = await getScoreSnapshots(req.session.userId, 366);
      history = shapeScoreSnapshotHistory(rows);
    } catch (e) {
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
    const snapshotValues = snapshotValuesFromProfile(effectiveProfile);

    try {
      await recordSnapshot(req.session.userId, snapshotValues);
    } catch (e) {
      // Recording is best-effort (e.g. pre-migration) — still return any history.
      console.error('/api/v1/snapshots record error:', e.message);
    }

    try {
      const { getCashFlowTransactions } = require('../db/transactions');
      const [transactions, investments] = await Promise.all([
        getCashFlowTransactions(req.session.userId, 30),
        assetsDb.listInvestments(req.session.userId),
      ]);
      await require('../services/calculation-lineage').recordSnapshotMetrics(
        req.session.userId,
        { snapshot: snapshotValues, transactions, investments }
      );
    } catch (e) {
      console.error('/api/v1/snapshots lineage error:', e.message);
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

// ─── Research (real — services/research.js + db/research.js) ───────────────
// Grounded, synchronous research reports (Finnhub + Bing → Azure synthesis).
// The DB stores a Markdown report; db/research.js maps it to the structured body
// the React view renders. All scoped to req.session.userId; before /v1/:table.
router.get('/v1/research', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const researchDb = require('../db/research');
    const rows = await researchDb.listReportsWithBody(req.session.userId, 20);
    res.json(rows.map(researchDb.rowToResearchReport));
  } catch (e) {
    console.error('/api/v1/research GET error:', e.message);
    res.status(500).json({ error: 'Could not load research' });
  }
});

// Start an async deep-research job (PR 8). Returns { jobId, status, phase }
// immediately; the pipeline (Plan→Gather→Compute→Write→Verify→Render) runs as a
// background promise in-process and the client polls GET /v1/research/:id.
router.post('/v1/research/generate', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const userId = req.session.userId;
  const question = String((req.body && (req.body.topic || (req.body.data && req.body.data.topic))) || '').trim().slice(0, 600);
  if (!question) return res.status(400).json({ error: 'Ask a research question first.' });
  try {
    // Metering: consume one research run (402 + upgrade prompt when over).
    const gate = await gateMonthlyAiUsage(req, res, 'research_runs');
    if (!gate) return;

    const researchDb = require('../db/research');
    const { getProfileByUserId } = require('../db/profiles');
    const assetsDb = require('../db/assets');
    const { computeMaalScore } = require('../lib/maal-score');
    const { runDeepResearch } = require('../services/research');

    const user = await findUserById(userId);
    const rawProfile = (await getProfileByUserId(userId)) || {};
    const assetSummary = await assetsDb.getAssetSummary(userId);
    const profile = assetsDb.mergeAssetSummaryIntoProfile(rawProfile, assetSummary);
    const maal = computeMaalScore(profile);

    const jobId = await researchDb.createJob(userId, question);
    // Fire-and-forget: the pipeline records its own success/failure on the job.
    setImmediate(() => {
      runDeepResearch({ jobId, user, profile, maal, question }).catch((e) => {
        console.error('runDeepResearch crashed:', e.message);
      });
    });
    res.json({ jobId: String(jobId), status: 'running', phase: 'plan' });
  } catch (err) {
    console.error('/api/v1/research/generate error:', err.message);
    res.status(500).json({ error: 'Could not start research.' });
  }
});

// Poll a research job's phase/status. When complete, returns the rendered report
// inline so the client can stop polling and show it.
router.get('/v1/research/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const researchDb = require('../db/research');
    const job = await researchDb.getJob(req.params.id, req.session.userId);
    if (!job) return res.status(404).json({ error: 'Research job not found.' });
    const elapsedMs = Date.now() - new Date(job.started_at).getTime();
    const out = { jobId: String(job.id), status: job.status, phase: job.phase, elapsedMs, error: job.error || null };
    if (job.status === 'complete' && job.report_id) {
      const row = await researchDb.getReport(job.report_id, req.session.userId);
      if (row) out.report = researchDb.rowToResearchReport(row);
    }
    res.json(out);
  } catch (err) {
    console.error('/api/v1/research/:id GET error:', err.message);
    res.status(500).json({ error: 'Could not load research status.' });
  }
});

// Branded PDF download for a finished report the user owns.
router.get('/v1/research/:id/pdf', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { generateResearchPdf } = require('../services/report');
    const out = await generateResearchPdf(req.session.userId, req.params.id);
    if (!out) return res.status(404).json({ error: 'Report not found.' });
    res.json(out); // { filename, base64 } — client turns it into a download
  } catch (err) {
    console.error('/api/v1/research/:id/pdf error:', err.message);
    res.status(500).json({ error: 'Could not generate the PDF.' });
  }
});

router.delete('/v1/research/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const researchDb = require('../db/research');
    await researchDb.deleteReport(req.params.id, req.session.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('/api/v1/research/:id DELETE error:', err.message);
    res.status(500).json({ error: 'Could not delete report.' });
  }
});

// ─── Radar (real — db/radar.js + services/radar.js) ───────────────────────
// React calls these "alerts"; the backend model is "radars". All scoped to
// req.session.userId; registered before /v1/:table. Accept either the Lovable
// { data: {...} } envelope or a flat body.
function unwrap(body) { return (body && body.data && typeof body.data === 'object') ? body.data : (body || {}); }

router.get('/v1/alerts', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const radarDb = require('../db/radar');
    const [radars, events] = await Promise.all([
      radarDb.listRadars(req.session.userId),
      radarDb.listEvents(req.session.userId, 30),
    ]);
    res.json({ alerts: radars.map(radarDb.radarToAlert), events: events.map(radarDb.eventToAlertEvent) });
  } catch (e) {
    console.error('/api/v1/alerts GET error:', e.message);
    res.status(500).json({ error: 'Could not load radars' });
  }
});

router.post('/v1/alerts', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const radarDb = require('../db/radar');
    const { extractSymbols } = require('../services/radar');
    const d = unwrap(req.body);
    const prompt = String(d.prompt || '').trim().slice(0, 600);
    if (!prompt) return res.status(400).json({ error: 'Describe what Maal should watch.' });

    // Metering: active radars is a CONCURRENT limit (not monthly). The count +
    // insert happen atomically inside createRadarIfUnderActiveLimit (per-user
    // advisory lock) so two concurrent creates can't both exceed the cap.
    const user = await findUserById(req.session.userId);
    const plan = planLimits.normalizePlan(user && user.plan);
    const limit = planLimits.limitFor(plan, 'active_radars');
    const freq = ['daily', 'weekly', 'monthly'].includes(d.frequency) ? d.frequency : 'daily';
    const id = await radarDb.createRadarIfUnderActiveLimit(req.session.userId, {
      prompt,
      symbols: extractSymbols(prompt),
      frequency: freq,
      notifyEmail: d.notify_email !== false,
      notifySms: !!d.notify_sms,
      timeAest: d.time_aest,
      scheduleDay: d.schedule_day,
      templateSlug: d.template,
    }, limit);
    if (id === null) {
      return send402(res, plan, 'active_radars', limit, limit);
    }
    const row = await radarDb.getRadar(id, req.session.userId);
    res.json(radarDb.radarToAlert(row));
  } catch (e) {
    console.error('/api/v1/alerts POST error:', e.message);
    res.status(500).json({ error: 'Could not create radar.' });
  }
});

router.delete('/v1/alerts/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const radarDb = require('../db/radar');
    await radarDb.deleteRadar(req.params.id, req.session.userId);
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/v1/alerts DELETE error:', e.message);
    res.status(500).json({ error: 'Could not delete radar.' });
  }
});

router.post('/v1/alerts/toggle', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const radarDb = require('../db/radar');
    const d = unwrap(req.body);
    if (!d.id) return res.status(400).json({ error: 'id required' });
    const activating = d.active !== false;
    if (activating) {
      // Re-activating counts toward the concurrent active-radar limit — enforce
      // it atomically (count + update under a per-user lock). Deactivating is
      // always allowed.
      const user = await findUserById(req.session.userId);
      const plan = planLimits.normalizePlan(user && user.plan);
      const limit = planLimits.limitFor(plan, 'active_radars');
      const ok = await radarDb.activateRadarIfUnderLimit(d.id, req.session.userId, limit);
      if (!ok) {
        return send402(res, plan, 'active_radars', limit, limit);
      }
    } else {
      await radarDb.setRadarActive(d.id, req.session.userId, false);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/v1/alerts/toggle error:', e.message);
    res.status(500).json({ error: 'Could not update radar.' });
  }
});

// Run radars now (manual). One if alertId given, else all the user's radars.
router.post('/v1/alerts/evaluate', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const radarDb = require('../db/radar');
    const { runRadar } = require('../services/radar');
    const d = unwrap(req.body);
    let fired = 0;
    if (d.alertId) {
      const r = await runRadar(d.alertId, req.session.userId);
      if (r && r.alerted) fired++;
    } else {
      const radars = await radarDb.listRadars(req.session.userId);
      for (const radar of radars) {
        try { const r = await runRadar(radar.id, req.session.userId); if (r && r.alerted) fired++; }
        catch (e) { console.error(`radar ${radar.id} run failed:`, e.message); }
      }
    }
    res.json({ fired });
  } catch (e) {
    console.error('/api/v1/alerts/evaluate error:', e.message);
    res.status(500).json({ error: 'Could not evaluate radars.' });
  }
});

// ─── Radar templates + readiness (PR 9) ────────────────────────────────────
// Curated AU template marketplace (browsable by everyone — creating a radar from
// one still goes through POST /v1/alerts, which enforces the Pro/Max limit) and
// a readiness score for the user's data. Registered before /v1/:table.

router.get('/v1/radar-templates', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const radarDb = require('../db/radar');
    res.json({ templates: await radarDb.listTemplates() });
  } catch (e) {
    console.error('/api/v1/radar-templates error:', e.message);
    res.json({ templates: [] });
  }
});

router.get('/v1/radar/readiness', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { getProfileByUserId } = require('../db/profiles');
    const assetsDb = require('../db/assets');
    const { computeRadarReadiness } = require('../lib/radar-logic');
    const rawProfile = (await getProfileByUserId(req.session.userId)) || {};
    const assetSummary = await assetsDb.getAssetSummary(req.session.userId);
    const profile = assetsDb.mergeAssetSummaryIntoProfile(rawProfile, assetSummary);
    res.json(computeRadarReadiness(profile));
  } catch (e) {
    console.error('/api/v1/radar/readiness error:', e.message);
    res.json({ score: 0, missing: [], ready: false });
  }
});

// ─── Report (real — server-side PDF via services/report.js) ────────────────
// POST /api/v1/report → { filename, base64 } of a one-page financial snapshot
// PDF (Maal Score, net worth, retirement, action plan). Scoped to the session
// user; before /v1/:table.
router.post('/v1/report', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { generateFinancialReport } = require('../services/report');
    const out = await generateFinancialReport(req.session.userId);
    res.json(out);
  } catch (e) {
    console.error('/api/v1/report error:', e.message);
    res.status(500).json({ error: 'Could not generate report.' });
  }
});

// ─── AI-generated files emailed on request (PR 11) ─────────────────────────
// POST /api/v1/files/generate { type: csv|excel|pdf, dataset: net_worth|
// transactions|goals|balances } → builds the file from the user's REAL data and
// emails it as an attachment. Metered against ai_files (Free = 0 → 402 upgrade
// prompt; Pro 10 / Max 100 per month). Scoped to the session user.
router.post('/v1/files/generate', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const d = (req.body && req.body.data && typeof req.body.data === 'object') ? req.body.data : (req.body || {});
    const filegen = require('../services/filegen');
    const type = String(d.type || '').toLowerCase();
    const dataset = String(d.dataset || 'net_worth');

    // Metering: consume one ai_files credit (402 + upgrade prompt when over/free).
    const gate = await gateMonthlyAiUsage(req, res, 'ai_files');
    if (!gate) return;

    let out;
    try {
      out = await filegen.generateAndEmailFile(req.session.userId, { type, dataset });
    } catch (e) {
      console.error('file generate/email failed:', e.message);
      return res.status(400).json({ error: 'Could not generate that file. Check the type and try again.' });
    }
    res.json({ ok: true, ...out });
  } catch (err) {
    console.error('/api/v1/files/generate error:', err.message);
    res.status(500).json({ error: 'Could not generate the file.' });
  }
});

// ─── Transactions depth: categories, rules, subscriptions (PR 6) ───────────
// All registered BEFORE /v1/:table so they aren't swallowed by the generic
// handler. Scoped to req.session.userId. Categories live in a separate table,
// so the protected `transactions` table is never altered.

// GET /v1/transaction-categories — the 18-group taxonomy for pickers.
router.get('/v1/transaction-categories', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const { TAXONOMY } = require('../lib/transaction-categories');
  res.json({ groups: TAXONOMY.map((t) => ({ group: t.group, categories: t.categories })) });
});

// GET /v1/transactions — transactions with their category. Rows without a stored
// category get a best-effort auto-category for DISPLAY only (not persisted).
// Registered before the generic GET /v1/:table so it wins for this table.
router.post('/v1/transactions', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  let row;
  try {
    const { normalizeImportedTransaction } = require('../lib/transaction-import');
    row = normalizeImportedTransaction(
      req.body?.data && typeof req.body.data === 'object' ? req.body.data : req.body
    );
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  let client;
  try {
    client = await pool.connect();
    const { payloadHash } = require('../lib/data-quality');
    const hash = payloadHash(row);
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO transactions (user_id, description, amount, status, post_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.session.userId, row.description, row.amount, row.status, row.post_date]
    );
    await client.query(
      `INSERT INTO raw_financial_records
         (user_id, source, entity_type, source_record_id, payload, payload_hash)
       VALUES ($1, 'manual_import', 'transaction', $2, $3::jsonb, $4)
       ON CONFLICT (user_id, source, entity_type, source_record_id, payload_hash)
       DO NOTHING`,
      [req.session.userId, `request:${hash}`, JSON.stringify(row), hash]
    );
    await client.query('COMMIT');

    try {
      const quality = require('../services/data-quality');
      await quality.runDataQualityChecks(req.session.userId, {
        trigger: 'transaction_import',
        coverage: { accounts: 'complete', transactions: 'complete' },
      });
    } catch (qualityError) {
      console.error('Post-transaction-import quality check failed:', qualityError.message);
      try {
        await require('../services/data-quality').recordDataQualityFailure(req.session.userId, {
          trigger: 'transaction_import',
          coverage: { accounts: 'complete', transactions: 'failed' },
          message: qualityError.message,
        });
      } catch (recordError) {
        console.error('Could not record transaction-import quality failure:', recordError.message);
      }
    }
    return res.json(inserted.rows[0]);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('/api/v1/transactions POST error:', error.message);
    return res.status(500).json({ error: 'Could not import transaction' });
  } finally {
    if (client) client.release();
  }
});

router.get('/v1/transactions', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const txnDb = require('../db/transactions');
    const { autoCategorize } = require('../lib/transaction-categories');
    const rows = await txnDb.getTransactionsWithCategory(req.session.userId, 500);
    const out = rows.map((r) => {
      if (r.category_group) return r;
      const auto = autoCategorize(r.description, r.amount);
      return auto ? { ...r, category_group: auto.group, category: auto.category, category_source: 'auto' } : r;
    });
    res.json(out);
  } catch (e) {
    console.error('/api/v1/transactions GET error:', e.message);
    res.status(500).json({ error: 'Could not load transactions' });
  }
});

// GET /v1/transactions/subscriptions — detected recurring payments.
router.get('/v1/transactions/subscriptions', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const txnDb = require('../db/transactions');
    const { detectSubscriptions } = require('../services/transaction-rules');
    const txns = await txnDb.getTxnsForSubscriptions(req.session.userId, 400);
    res.json({ subscriptions: detectSubscriptions(txns) });
  } catch (e) {
    console.error('/api/v1/transactions/subscriptions error:', e.message);
    res.status(500).json({ error: 'Could not detect subscriptions' });
  }
});

// PATCH /v1/transactions/:id/category — manually (re)categorise one transaction.
router.patch('/v1/transactions/:id/category', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { isKnownGroup } = require('../lib/transaction-categories');
    const txnDb = require('../db/transactions');
    const d = (req.body && req.body.data && typeof req.body.data === 'object') ? req.body.data : (req.body || {});
    if (!isKnownGroup(d.category_group)) return res.status(400).json({ error: 'Unknown category group.' });
    const ok = await txnDb.setTransactionCategory(req.session.userId, req.params.id, d.category_group, d.category, 'manual');
    if (!ok) return res.status(404).json({ error: 'Transaction not found.' });
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/v1/transactions/:id/category error:', e.message);
    res.status(500).json({ error: 'Could not update category' });
  }
});

// Rules CRUD + apply.
router.get('/v1/transaction-rules', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const txnDb = require('../db/transactions');
    res.json({ rules: await txnDb.listRules(req.session.userId) });
  } catch (e) {
    console.error('/api/v1/transaction-rules GET error:', e.message);
    res.status(500).json({ error: 'Could not load rules' });
  }
});

router.post('/v1/transaction-rules', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { isKnownGroup } = require('../lib/transaction-categories');
    const txnDb = require('../db/transactions');
    const d = (req.body && req.body.data && typeof req.body.data === 'object') ? req.body.data : (req.body || {});
    if (!String(d.match_text || '').trim()) return res.status(400).json({ error: 'Enter text to match.' });
    if (!isKnownGroup(d.category_group)) return res.status(400).json({ error: 'Pick a category group.' });
    if (!['contains', 'equals', 'starts_with'].includes(d.match_type || 'contains')) d.match_type = 'contains';
    const id = await txnDb.createRule(req.session.userId, d);
    res.json({ ok: true, id });
  } catch (e) {
    console.error('/api/v1/transaction-rules POST error:', e.message);
    res.status(500).json({ error: 'Could not create rule' });
  }
});

router.delete('/v1/transaction-rules/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const txnDb = require('../db/transactions');
    await txnDb.deleteRule(req.params.id, req.session.userId);
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/v1/transaction-rules DELETE error:', e.message);
    res.status(500).json({ error: 'Could not delete rule' });
  }
});

// POST /v1/transaction-rules/apply — categorise all the user's transactions
// against their current rules (historical + incoming).
router.post('/v1/transaction-rules/apply', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const txnDb = require('../db/transactions');
    const { computeAssignments } = require('../services/transaction-rules');
    const [rules, rows] = await Promise.all([
      txnDb.listRules(req.session.userId),
      txnDb.getTransactionsWithCategory(req.session.userId, 2000),
    ]);
    // Never let a rule overwrite a category the user set by hand.
    const eligible = rows.filter((r) => r.category_source !== 'manual');
    const assignments = computeAssignments(rules, eligible);
    const applied = await txnDb.applyCategoryAssignments(req.session.userId, assignments);
    res.json({ ok: true, applied });
  } catch (e) {
    console.error('/api/v1/transaction-rules/apply error:', e.message);
    res.status(500).json({ error: 'Could not apply rules' });
  }
});

// ─── Source-linked live goals (PR 7) ──────────────────────────────────────
// Goals track progress DERIVED from the user's live financials (net worth /
// cash / super / investments / debts) rather than a static number they type.
// Registered BEFORE /v1/:table and EXCLUDED from the generic handler so:
//   1. progress is computed server-side from live data (db/goals.listGoals), and
//   2. DELETE /v1/goals/:id works (the generic handler only deletes by ?filter=,
//      so the client's path-param delete previously hit the no-op catch-all).
// All scoped to req.session.userId.

router.get('/v1/goals', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const goalsDb = require('../db/goals');
    res.json(await goalsDb.listGoals(req.session.userId));
  } catch (e) {
    console.error('/api/v1/goals GET error:', e.message);
    res.json([]);
  }
});

router.post('/v1/goals', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const goalsDb = require('../db/goals');
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'A goal needs a name.' });
    // Upsert: the client's upsertGoal sends the id when editing.
    if (body.id) {
      const updated = await goalsDb.updateGoal(body.id, req.session.userId, body);
      if (!updated) return res.status(404).json({ error: 'Goal not found.' });
      return res.json(updated);
    }
    res.json(await goalsDb.createGoal(req.session.userId, body));
  } catch (e) {
    console.error('/api/v1/goals POST error:', e.message);
    res.status(500).json({ error: 'Could not save goal.' });
  }
});

router.patch('/v1/goals/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const goalsDb = require('../db/goals');
    const updated = await goalsDb.updateGoal(req.params.id, req.session.userId, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Goal not found.' });
    res.json(updated);
  } catch (e) {
    console.error('/api/v1/goals PATCH error:', e.message);
    res.status(500).json({ error: 'Could not update goal.' });
  }
});

router.delete('/v1/goals/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const goalsDb = require('../db/goals');
    await goalsDb.deleteGoal(req.params.id, req.session.userId);
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/v1/goals DELETE error:', e.message);
    res.status(500).json({ error: 'Could not delete goal.' });
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
  'linked_accounts', 'transactions',
  // NOTE: 'goals' is deliberately EXCLUDED — it has dedicated routes above that
  // derive live progress and validate source_type/target_kind. The generic
  // handler would store a stale current_amount and skip that validation.
  // BUG-5 FIX: 'profiles' table does not exist; the correct table is 'user_profiles'
  // 'user_profiles' is intentionally not in the generic API (profile updates go through /dashboard/profile)
  // NOTE: 'maal_score_snapshots' is deliberately EXCLUDED. Daily score history is
  // written server-side by GET /api/v1/score and read back through the same
  // endpoint; exposing it to the generic handler would let a client fabricate or
  // delete their own score history. (The old 'score_snapshots' allowlist entry
  // was removed with the dead client-side snapshotScore write — no such table
  // ever existed.)
  // NOTE: 'transaction_rules' and 'transaction_categories' are deliberately
  // EXCLUDED from the generic handler. Their dedicated routes enforce taxonomy
  // validation (isKnownGroup) and per-row ownership (setTransactionCategory
  // checks the transaction belongs to the user). Adding them here would expose
  // an IDOR on transaction_categories (the generic POST doesn't verify a
  // supplied transaction_id is the caller's). Do not add them.
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
