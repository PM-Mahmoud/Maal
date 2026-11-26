// routes/api.js — JSON API for the React SPA
const { safeError } = require('../lib/safe-log');
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
    res.json({ id: user.id, email: user.email, name: user.name || null, plan: user.plan || 'free' });
  } catch (e) {
    console.error('/api/me error:', safeError(e));
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
    console.error('/api/auth/login error:', safeError(e));
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

router.post('/auth/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const strengthError = require('../lib/password-rules').passwordStrengthError(password);
  if (strengthError) return res.status(400).json({ error: strengthError });
  try {
    const { findUserByEmail } = require('../db/users');
    const existing = await findUserByEmail(email.toLowerCase().trim());
    if (existing) return res.status(409).json({ error: 'Email already in use' });
    const waitlistAccess = require('../services/waitlist-access');
    if (!(await waitlistAccess.canSignUp(email.toLowerCase().trim(), req.session.referralCode))) {
      return res.status(403).json({ error: waitlistAccess.NOT_INVITED_MESSAGE, code: 'not_invited' });
    }
    const hash = await bcrypt.hash(password, 12);
    const user = await createUser({ email: email.toLowerCase().trim(), passwordHash: hash, provider: 'email' });
    waitlistAccess.recordJoined(user.email);
    await require('../services/referrals').onSignup(req, user);
    await new Promise((resolve, reject) => req.session.regenerate(e => e ? reject(e) : resolve()));
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    await new Promise((ok, err) => req.session.save(e => e ? err(e) : ok()));
    res.json({ user: { id: user.id, email: user.email, plan: 'free' } });
  } catch (e) {
    console.error('/api/auth/signup error:', safeError(e));
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
// Effective plan = stored plan + 14-day trial (services/access.js). Trial users
// get member limits; an expired trial without a paid plan is 'free' (paywall).
const access = require('../services/access');
const { unknownColumnMessage } = require('../lib/db-errors');
async function effectivePlanFor(user) {
  return (await access.forUser(user)).plan;
}

function send402(res, plan, feature, limit, used) {
  const p = planLimits.normalizePlan(plan);
  res.status(402).json({
    error: planLimits.upgradeMessage(plan, feature),
    code: 'usage_limit',
    // Free here means the trial ended with no paid plan → client shows the paywall.
    trialEnded: p === 'free',
    upgrade: true,
    upgradeUrl: '/app/billing',
    feature,
    plan: p,
    // The member Ask Maal cap is never shown to users, so don't send it.
    limit: p === 'member' && feature === 'advisor_messages' ? null : limit,
    used: p === 'member' && feature === 'advisor_messages' ? null : used,
  });
}

// Check + atomically consume one use of a monthly AI feature. Sends the 402
// itself and returns null when over the limit; otherwise returns { user }.
// The check-and-consume is a single atomic DB op (incrementIfUnder) so two
// concurrent requests can't both slip past the cap. Fails OPEN on infrastructure
// errors — availability wins, and the failure is logged.
async function gateMonthlyAiUsage(req, res, feature) {
  const user = await findUserById(req.session.userId);
  const plan = await effectivePlanFor(user);
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
    console.error('[usage] metering failed open for ' + feature + ':', safeError(e));
  }
  return { user };
}

// GET /api/v1/usage — plan + per-feature usage for the current period.
router.get('/v1/usage', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await findUserById(req.session.userId);
    const acc = await access.forUser(user);
    const plan = acc.plan;
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
    // The member Ask Maal cap is never shown: send usage but no number to show.
    if (plan === 'member') features.advisor_messages.limit = null;
    const now = new Date();
    const resetsOn = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
    const { MEMBERSHIP, formatAud, offerLine } = require('../lib/membership');
    res.json({
      plan,
      basePlan: acc.basePlan,
      paid: acc.paid,
      paywalled: acc.paywalled,
      trial: acc.trial && {
        active: acc.trial.active,
        endsAt: acc.trial.endsAt ? acc.trial.endsAt.toISOString() : null,
        daysLeft: acc.trial.daysLeft,
      },
      offer: {
        firstYear: formatAud(MEMBERSHIP.firstYearCents),
        renewal: formatAud(MEMBERSHIP.yearCents),
        line: offerLine(),
      },
      period, resetsOn, features,
    });
  } catch (e) {
    console.error('/api/v1/usage error:', safeError(e));
    res.status(500).json({ error: 'Could not load usage' });
  }
});

// ─── Advisor (AI chat) ────────────────────────────────────────────────────

async function advisorMessage(req, res, { stream = false } = {}) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const controller = stream ? new AbortController() : null;
  const signal = controller?.signal;
  const disconnect = () => controller.abort();
  let heartbeat;
  let streaming = false;
  const event = (name, data) => {
    signal?.throwIfAborted();
    res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const onStep = stream ? (stage, phase) => event('step', { stage, phase }) : undefined;
  if (stream) res.once('close', disconnect);
  try {
    const advisor = require('../services/advisor');
    const { message, history = [] } = req.body || {};
    if (stream && (typeof message !== 'string' || !message.trim() || !Array.isArray(history)
      || history.slice(-10).some(turn => !turn || !['user', 'assistant'].includes(turn.role) || typeof turn.content !== 'string'))) {
      return res.status(400).json({ error: 'Provide a valid message and history.' });
    }
    if (!message) return res.status(400).json({ error: 'message required' });
    if (!advisor.hasAdvisor()) {
      if (stream) return res.status(503).json({ error: 'The advisor is temporarily unavailable.' });
      // Env-var names stay in the server log; members see a plain message
      // (the reply renders as markdown, which mangled the underscored names).
      console.warn('[advisor] no model configured — set AZURE_OPENAI_API_KEY or GROQ_API_KEY in the host env');
      return res.json({
        reply: "I'm not able to answer right now because Maal's advisor is offline. Please try again a little later.",
        live: false,
      });
    }

    const radarTool = require('../services/advisor-radar');
    const watch = radarTool.watchPrompt(message);
    if (watch !== null) {
      if (!watch) {
        return res.json({ ok: true, reply: 'Which financial event would you like me to watch? Try “Watch the next RBA rate decision for me.”', live: false });
      }
      const user = await findUserById(req.session.userId);
      const plan = await effectivePlanFor(user);
      const limit = planLimits.limitFor(plan, 'active_radars');
      signal?.throwIfAborted();
      const result = await radarTool.runWatchTool({ userId: req.session.userId, prompt: watch, limit, signal });
      if (result.limited) return send402(res, plan, 'active_radars', limit, limit);
      return res.json({ ok: true, reply: result.reply, live: false });
    }

    const researchTool = require('../services/advisor-research');
    const question = researchTool.researchQuestion(message, history);
    if (question === '') {
      const reply = 'What would you like me to research? Send “Research” followed by a topic or question.';
      return res.json({ ok: true, reply, widgets: [], followUps: [], citations: [], live: false });
    }
    // Apply the appropriate quota before sending stream headers.
    const gate = await gateMonthlyAiUsage(req, res, question === null ? 'advisor_messages' : 'research_runs');
    if (!gate) return;
    signal?.throwIfAborted();
    if (stream) {
      res.set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      });
      streaming = true;
      res.flushHeaders();
      onStep('retrieving_data', 'start');
      heartbeat = setInterval(() => {
        if (!signal.aborted && !res.destroyed) res.write(': keep-alive\n\n');
      }, 15000);
      heartbeat.unref();
    }

    // Feed the advisor the SAME dashboard context the EJS /dashboard/ask/message
    // uses: merged effective profile, Maal Score, Vault docs, 30d transactions,
    // 90d net-worth snapshots, goals, cash runway. Without this the React Ask Maal
    // had no access to the user's financial data (advisor.complete = raw model).
    const { getProfileByUserId } = require('../db/profiles');
    const assetsDb = require('../db/assets');
    const { computeMaalScore } = require('../lib/maal-score');
    const vaultDb = require('../db/vault');
    const { getCashFlowTransactions } = require('../db/transactions');
    const { getSnapshots } = require('../db/snapshots');
    const goalsDb = require('../db/goals');
    const isaacus = require('../services/isaacus');

    const { user } = gate;
    const rawProfile = (await getProfileByUserId(req.session.userId)) || {};
    signal?.throwIfAborted();
    const assetSummary = await assetsDb.getAssetSummary(req.session.userId);
    signal?.throwIfAborted();
    const profile = assetsDb.mergeAssetSummaryIntoProfile(rawProfile, assetSummary);
    const maal = computeMaalScore(profile);

    if (question !== null) {
      const research = await researchTool.runResearchTool({ user, profile, maal, question, signal, onStep, requireVerification: stream });
      const { reply, widgets, followUps, citations, live } = research;
      if (stream) {
        event('final', { reply, widgets, followUps, citations });
        event('done', {});
        return res.end();
      }
      return res.json({ ok: true, reply, widgets, followUps, citations, live });
    }

    let docs = [];
    try { docs = await vaultDb.getReadableDocs(req.session.userId); }
    catch (e) { console.error('vault docs for advisor failed:', safeError(e)); }

    signal?.throwIfAborted();
    const [txns, snaps, goals] = await Promise.all([
      getCashFlowTransactions(req.session.userId, 30).catch(() => []),
      getSnapshots(req.session.userId, 90).catch(() => []),
      goalsDb.listGoals(req.session.userId).catch(() => []),
    ]);
    signal?.throwIfAborted();
    const { calculateCashRunway } = require('../lib/spending-cashflow');
    const runway = calculateCashRunway(txns, profile.cash_savings, profile.monthly_expenses);
    const cashRunway = runway.months == null ? null : Math.round(runway.months);

    // Legal/tax grounding from the user's own Vault docs (only when they have any).
    let isaacusGrounding = null;
    if (isaacus.hasIsaacus() && docs.length) {
      try {
        if ((await isaacus.classifyLegalIntent(message, { signal })) >= 0.35) {
          signal?.throwIfAborted();
          const answer = await isaacus.extractAnswer(message, docs.map((d) => d.extracted_text), { signal });
          if (answer) isaacusGrounding = { text: answer.text, score: answer.score, filename: docs[answer.sourceIndex] ? docs[answer.sourceIndex].filename : null };
        }
      } catch (e) { signal?.throwIfAborted(); console.error('[isaacus] grounding lookup failed:', safeError(e)); }
    }

    signal?.throwIfAborted();
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
    } catch (e) { console.error('[advisor] memory/instructions load failed:', safeError(e)); }

    const extra = { transactions: txns, snapshots: snaps, goals, cashRunway, cashRunwayFromTransactions: runway.fromTransactions, isaacusGrounding, memory: memoryRow.content, customInstructions };
    // Rich web chat: reply text + generative-UI widgets (filled with the user's
    // real data server-side) + follow-up chips + internal-only citations.
    signal?.throwIfAborted();
    const rich = await advisor.chatRich(user, profile, maal, clean, docs, extra, { signal, onStep, requireVerification: stream });
    const { reply, widgets, followUps, citations, live } = rich;
    if (stream) {
      event('final', { reply, widgets, followUps, citations });
      event('done', {});
      res.end();
    } else {
      res.json({ ok: true, reply, widgets, followUps, citations, live });
    }

    // Deferred memory merge (after the response is flushed, debounced) — updates
    // the user's memory from this turn without adding latency to the reply.
    const memoryService = require('../services/advisor-memory');
    if (rich.live && memoryService.shouldMerge(memoryRow.last_merged_at)) {
      setImmediate(async () => {
        try {
          const transcript = memoryService.transcriptFromMessages([...clean, { role: 'assistant', content: rich.reply }]);
          const updated = await memoryService.mergeMemory(memoryRow.content, transcript);
          if (updated) await memoryDb.saveMemory(req.session.userId, updated);
        } catch (e) { console.error('[advisor] deferred memory merge failed:', safeError(e)); }
      });
    }
  } catch (err) {
    if (signal?.aborted || (stream && res.destroyed)) return;
    if (streaming) {
      console.warn('[advisor] streaming answer could not be completed');
      event('error', { message: 'The advisor couldn’t finish your answer. Please try again.' });
      res.end();
    } else if (stream) {
      res.status(500).json({ error: 'The advisor couldn’t finish your answer. Please try again.' });
    } else {
      console.error('advisor message error:', safeError(err));
      res.status(500).json({ reply: 'The advisor hit a snag — try again in a moment.', live: false });
    }
  } finally {
    clearInterval(heartbeat);
    if (stream) res.removeListener('close', disconnect);
  }
}

router.post('/v1/advisor/message', (req, res) => advisorMessage(req, res));
router.post('/v1/advisor/stream', (req, res) => advisorMessage(req, res, { stream: true }));

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
    console.error('/api/v1/advisor/memory GET error:', safeError(e));
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
    console.error('/api/v1/advisor/memory PUT error:', safeError(e));
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
    console.error('/api/v1/advisor/memory DELETE error:', safeError(e));
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
  const { getCashFlowTransactions } = require('../db/transactions');
  const { getSnapshots } = require('../db/snapshots');
  const goalsDb = require('../db/goals');
  const rawProfile = (await getProfileByUserId(userId)) || {};
  const assetSummary = await assetsDb.getAssetSummary(userId);
  const profile = assetsDb.mergeAssetSummaryIntoProfile(rawProfile, assetSummary);
  const maal = computeMaalScore(profile);
  const [transactions, snapshots, goals] = await Promise.all([
    getCashFlowTransactions(userId, 30).catch(() => []),
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
    console.error('/api/v1/widgets GET error:', safeError(e));
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
    console.error('/api/v1/widgets POST error:', safeError(e));
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
    console.error('/api/v1/widgets DELETE error:', safeError(e));
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
    console.error('/api/v1/data-health error:', safeError(error));
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
router.post(
  '/v1/reconciliations/:accountReference/adjustments',
  require('../services/reconciliation').adjustmentHandler
);
router.get(
  '/v1/reconciliations/:accountReference/adjustments',
  require('../services/reconciliation').listAdjustmentsHandler
);

// POST /api/v1/basiq/sync — trigger account + transaction sync, return JSON
router.post('/v1/basiq/sync', async (req, res) => {
  return require('../services/imports').enqueueBasiqImportHandler(req, res);
});

// Save the ownership label on selected accounts after a completed Basiq import.
router.post('/v1/basiq/ownership', (req, res) => {
  return require('../services/imports').saveBasiqOwnershipHandler(req, res);
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
    console.error('/api/v1/markets/earnings error:', safeError(e));
    res.json([]);
  }
});

// ─── Notifications ────────────────────────────────────────────────────────

router.get('/v1/notifications', async (req, res) => {
  if (!req.session.userId) return res.json([]);
  try { res.json(await require('../db/extensibility').listNotifications(req.session.userId, req.query.limit)); } catch (e) { res.status(500).json({ error: 'Could not load notifications' }); }
});
router.post('/v1/notifications/read', async (req, res) => { if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' }); try { await require('../db/extensibility').markNotificationsRead(req.session.userId, Array.isArray(req.body?.ids) ? req.body.ids : []); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: 'Could not update notifications' }); } });

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
    console.error('/api/v1/notification-prefs GET error:', safeError(e));
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
    console.error('/api/v1/notification-prefs POST error:', safeError(e));
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

    // Independent reads/writes run in parallel — every DB round-trip is costly.
    const [profileRow, assetSummary] = await Promise.all([
      getProfileByUserId(req.session.userId),
      assetsDb.getAssetSummary(req.session.userId),
    ]);
    const effectiveProfile = assetsDb.mergeAssetSummaryIntoProfile(profileRow || {}, assetSummary);
    const score = computeMaalScore(effectiveProfile);
    const lineage = require('../services/calculation-lineage')
      .recordScoreMetric(req.session.userId, score, effectiveProfile)
      .catch((e) => console.error('/api/v1/score lineage error:', safeError(e)));

    // Record today's score (upsert, at most one row/user/day) so the React
    // dashboard accrues a real daily history. Best-effort: recording or reading
    // history must never fail the live score. Only persist once the user has
    // actual data, so an empty profile doesn't seed a flat zero line.
    let history = [];
    if (score.hasData) {
      try {
        await recordScoreSnapshot(req.session.userId, score);
      } catch (e) {
        console.error('/api/v1/score record error:', safeError(e));
      }
    }
    try {
      const rows = await getScoreSnapshots(req.session.userId, 366);
      history = shapeScoreSnapshotHistory(rows);
    } catch (e) {
      console.error('/api/v1/score history error:', safeError(e));
    }
    await lineage;

    res.json({ ok: true, ...score, history });
  } catch (e) {
    console.error('/api/v1/score error:', safeError(e));
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
    console.error('/api/v1/profile GET error:', safeError(e));
    res.status(500).json({ error: 'Could not load profile' });
  }
});

// Current canonical totals for the My Wealth overview. This deliberately uses
// db/assets.js rather than recomputing in React so every consumer shares the
// same user-scoped wealth equation.
// Shared calculator contract for Advisor and Forecast. All inputs are owner-scoped.
router.post('/v1/calculators/:name', require('../services/advisor-calculators').calculatorHandler);

router.get('/v1/wealth-summary', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const assetsDb = require('../db/assets');
    const components = await assetsDb.getAssetSummary(req.session.userId);
    res.json({ ...assetsDb.wealthTotalsFromSummary(components), components });
  } catch (e) {
    console.error('/api/v1/wealth-summary error:', safeError(e));
    res.status(500).json({ error: 'Could not load wealth summary' });
  }
});

// W1.2 shadow read model. Existing asset tables remain the compatibility
// projection until parity has been proven in production; this endpoint exposes
// canonical accounts/holdings/valuations without allowing cross-user reads.
router.get('/v1/wealth/canonical', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    res.json(await require('../db/canonical-wealth').getCanonicalSnapshot(req.session.userId));
  } catch (e) {
    console.error('/api/v1/wealth/canonical error:', safeError(e));
    res.status(500).json({ error: 'Could not load canonical wealth records' });
  }
});

router.post('/v1/wealth/valuations', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const data = req.body || {};
    const required = ['subject_type', 'subject_key', 'classification', 'amount_minor', 'currency', 'as_of'];
    if (required.some((key) => data[key] === undefined || data[key] === null || data[key] === '')) {
      return res.status(400).json({ error: 'Missing required valuation fields' });
    }
    const valuation = await require('../db/canonical-wealth').appendValuation(req.session.userId, data);
    res.status(201).json(valuation);
  } catch (e) {
    console.error('/api/v1/wealth/valuations error:', safeError(e));
    const status = e.message === 'Superseded valuation not found' ? 404 : (e.statusCode || 500);
    res.status(status).json({ error: status < 500 ? e.message : 'Could not append valuation' });
  }
});

router.post('/v1/wealth/import-statement', require('../services/wealth-statement-import').statementImportHandler);

// Governed wealth services. Every calculation persists its exact input snapshot,
// methodology version and evidence lines; partner access is explicit and revocable.
const wealthServices = require('../services/wealth-services-api');
router.post('/v1/zakat/runs', wealthServices.calculateZakatHandler);
router.get('/v1/zakat/prefill', wealthServices.zakatPrefillHandler);
router.post('/v1/purification/runs', wealthServices.calculatePurificationHandler);
router.get('/v1/service-runs', wealthServices.listRunsHandler);
router.get('/v1/service-runs/:id/evidence', wealthServices.evidenceHandler);
router.get('/v1/purification/obligations', wealthServices.obligationsHandler);
router.post('/v1/purification/obligations/:id/satisfy', wealthServices.satisfyHandler);
router.get('/v1/marketplace', wealthServices.marketplaceHandler);
router.get('/v1/partner-consents', wealthServices.consentsHandler);
router.post('/v1/partners/:partnerKey/consents', wealthServices.consentHandler);
router.delete('/v1/partner-consents/:id', wealthServices.revokeHandler);
router.post('/v1/admin/partners', wealthServices.partnerManifestHandler);
router.post('/v1/admin/partners/:partnerKey/approval', wealthServices.partnerApprovalHandler);
router.post('/v1/admin/marketplace-governance', wealthServices.governanceHandler);
router.post('/v1/admin/methodologies/:serviceType/:key/:version/approve', wealthServices.methodologyApprovalHandler);
router.post('/v1/admin/purification-ratios', wealthServices.ratioDatasetHandler);
router.post('/v1/admin/partners/:partnerKey/sandbox-certification', wealthServices.sandboxCertificationHandler);

// ─── Collaboration and compliance (Build 8) ───────────────────────────────
// Membership is metadata only: it never widens access to another user's
// financial records. Shared reads require an explicit, active, scope-matched
// accountant/adviser grant and have no write endpoints.
const collaboration = require('../services/collaboration');
router.get('/v1/collaboration/households', collaboration.listHouseholdsHandler);
router.post('/v1/collaboration/households', collaboration.createHouseholdHandler);
router.get('/v1/collaboration/households/:householdId', collaboration.getHouseholdHandler);
router.post('/v1/collaboration/households/:householdId/members', collaboration.addMemberHandler);
router.patch('/v1/collaboration/households/:householdId/members/:userId', collaboration.updateMemberHandler);
router.delete('/v1/collaboration/households/:householdId/members/:userId', collaboration.removeMemberHandler);
router.get('/v1/collaboration/grants', collaboration.listGrantsHandler);
router.post('/v1/collaboration/grants', collaboration.createGrantHandler);
router.post('/v1/collaboration/grants/:grantId/accept', collaboration.acceptGrantHandler);
router.delete('/v1/collaboration/grants/:grantId', collaboration.revokeGrantHandler);
router.get('/v1/collaboration/documents', collaboration.listDocumentsHandler);
router.post('/v1/collaboration/documents', collaboration.linkDocumentHandler);
router.delete('/v1/collaboration/documents/:documentId', collaboration.unlinkDocumentHandler);
router.get('/v1/collaboration/shared/:ownerUserId/documents/:documentId', collaboration.sharedDocumentHandler);
router.get('/v1/collaboration/shared/:ownerUserId/tax-export', collaboration.taxExportHandler);
router.get('/v1/collaboration/shared/:ownerUserId/:scope', collaboration.sharedReadHandler);

router.patch('/v1/profile', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { patchProfile, normalizeProfile } = require('../db/profiles');
    const { findUserById } = require('../db/users');
    // Settings → Profile details: reject invalid values with per-field errors.
    const { errors } = require('../lib/profile-details').validateProfileDetails(req.body || {});
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: Object.values(errors)[0], fields: errors });
    }
    const row = await patchProfile(req.session.userId, req.body || {});
    const user = await findUserById(req.session.userId);
    res.json(normalizeProfile(row, user));
  } catch (e) {
    console.error('/api/v1/profile PATCH error:', safeError(e));
    res.status(500).json({ error: 'Could not save profile' });
  }
});

// ─── Net-worth snapshots (real history for the dashboard tiles/charts) ─────
// GET /api/v1/snapshots?days=N → oldest-first immutable daily series.
// Capture is performed by the authenticated daily cron sweep, never by reads.
// Account-filtered history reads only stored observations. The selected IDs
// travel in a JSON body so provider references stay out of request URLs.
router.post('/v1/snapshots/accounts', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const { account_keys: keys, days: requestedDays } = req.body || {};
  if (!Array.isArray(keys) || !keys.length || keys.length > 500
    || !keys.every((key) => typeof key === 'string' && /^[a-z]+:[A-Za-z0-9_-]{1,200}$/.test(key))) {
    return res.status(400).json({ error: 'Provide a valid account selection.' });
  }
  const days = Math.min(Math.max(parseInt(requestedDays, 10) || 3660, 1), 3660);
  try {
    const series = await require('../db/account-snapshots').listAccountSnapshotSeries(req.session.userId, [...new Set(keys)], days);
    return res.json(series);
  } catch (error) {
    console.error('Could not load account snapshots:', safeError(error));
    return res.status(500).json({ error: 'Could not load account history.' });
  }
});

router.get('/v1/snapshots', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { getSnapshots } = require('../db/snapshots');

    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 366, 1), 3660);

    const rows = require('../lib/snapshot-changes').explainSnapshotSeries(
      await getSnapshots(req.session.userId, days)
    );
    res.json(rows.map((r) => ({
      date: r.snap_date,
      netWorth: Number(r.net_worth) || 0,
      assets: Number(r.assets_total) || 0,
      super: Number(r.super_balance) || 0,
      investments: Number(r.invest_balance) || 0,
      debts: Number(r.debts_total) || 0,
      cash: Number(r.cash_balance) || 0,
      change: r.change,
    })));
  } catch (e) {
    console.error('/api/v1/snapshots error:', safeError(e));
    res.status(500).json({ error: 'Could not load snapshots' });
  }
});
router.get(
  '/v1/investment-performance',
  require('../services/investment-performance').investmentPerformanceHandler
);
router.get('/v1/cashflow-forecast', require('../services/cashflow-forecast').forecastHandler);
router.get('/v1/cash-risks', require('../services/cash-risks').cashRiskHandler);
router.post('/v1/monthly-closes/:month', require('../services/monthly-close').monthlyCloseHandler);
router.get('/v1/monthly-closes', require('../services/monthly-close').listMonthlyClosesHandler);
router.post('/v1/financial-export', require('../services/financial-export').financialExportHandler);
router.get('/v1/data-portability', require('../services/collaboration').dataPortabilityHandler);
router.post('/v1/data-portability', require('../services/collaboration').dataPortabilityHandler);
router.post('/v1/account/deletion', require('../services/collaboration').deleteAccountHandler);
router.get('/v1/planning', require('../services/planning').previewHandler);
router.post('/v1/planning', require('../services/planning').saveHandler);
router.get('/v1/planning/history', require('../services/planning').historyHandler);
router.get('/v1/recommendation-actions', require('../services/recommendation-actions').listHandler);
router.post('/v1/recommendation-actions/refresh', require('../services/recommendation-actions').refreshHandler);
router.post('/v1/recommendation-actions/:id/status', require('../services/recommendation-actions').statusHandler);
router.post('/v1/recommendation-actions/:id/outcomes', require('../services/recommendation-actions').outcomeHandler);

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
    console.error('/api/v1/vault GET error:', safeError(e));
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
    catch (e) { console.error('vault extract on upload failed:', safeError(e)); }
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
    console.error('/api/v1/vault POST error:', safeError(err));
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
    console.error('/api/v1/vault/:id GET error:', safeError(err));
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
    console.error('/api/v1/vault/:id DELETE error:', safeError(err));
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
    console.error('/api/v1/vault/:id/extract error:', safeError(err));
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
    console.error('/api/v1/research GET error:', safeError(e));
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

    const rawProfile = (await getProfileByUserId(userId)) || {};
    const assetSummary = await assetsDb.getAssetSummary(userId);
    const profile = assetsDb.mergeAssetSummaryIntoProfile(rawProfile, assetSummary);
    const maal = computeMaalScore(profile);

    const jobId = await researchDb.createJob(userId, question);
    // Fire-and-forget: the pipeline records its own success/failure on the job.
    setImmediate(() => {
      runDeepResearch({ jobId, userId, profile, maal, question }).catch((e) => {
        console.error('runDeepResearch crashed:', safeError(e));
      });
    });
    res.json({ jobId: String(jobId), status: 'running', phase: 'plan' });
  } catch (err) {
    console.error('/api/v1/research/generate error:', safeError(err));
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
    console.error('/api/v1/research/:id GET error:', safeError(err));
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
    console.error('/api/v1/research/:id/pdf error:', safeError(err));
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
    console.error('/api/v1/research/:id DELETE error:', safeError(err));
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
    console.error('/api/v1/alerts GET error:', safeError(e));
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
    const plan = await effectivePlanFor(user);
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
    console.error('/api/v1/alerts POST error:', safeError(e));
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
    console.error('/api/v1/alerts DELETE error:', safeError(e));
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
      const plan = await effectivePlanFor(user);
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
    console.error('/api/v1/alerts/toggle error:', safeError(e));
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
        catch (e) { console.error('Radar run failed:', safeError(e)); }
      }
    }
    res.json({ fired });
  } catch (e) {
    console.error('/api/v1/alerts/evaluate error:', safeError(e));
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
    console.error('/api/v1/radar-templates error:', safeError(e));
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
    console.error('/api/v1/radar/readiness error:', safeError(e));
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
    console.error('/api/v1/report error:', safeError(e));
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
      console.error('file generate/email failed:', safeError(e));
      return res.status(400).json({ error: 'Could not generate that file. Check the type and try again.' });
    }
    res.json({ ok: true, ...out });
  } catch (err) {
    console.error('/api/v1/files/generate error:', safeError(err));
    res.status(500).json({ error: 'Could not generate the file.' });
  }
});

// ─── Session 2 – Breakdown & budget (HEL-84..HEL-90) ─────────────────────
// Custom categories + category groups (lib/spending-categories.js,
// db/spending-categories.js, migration 1756900000000) and the "Create a budget
// with Maal" suggestion. Budgets themselves stay in routes/spending-settings.js.
// Every query is scoped to req.session.userId in SQL. Registered before the
// generic /v1/:table handler.

const spendCats = require('../lib/spending-categories');
const spendCatsDb = () => require('../db/spending-categories');

function s2Id(v) {
  const s = String(v == null ? '' : v);
  return /^[1-9]\d{0,17}$/.test(s) ? s : null;
}
function s2Fail(res, where, e) {
  console.error(`[breakdown] ${where} failed:`, safeError(e));
  if (e && e.code === '23505') return res.status(409).json({ error: 'That name is already in use.' });
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

// GET /v1/spending-categories → { categories: [custom], groups: [{ id, name, kind, color, categories }] }
router.get('/v1/spending-categories', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const db = spendCatsDb();
    const [custom, g] = await Promise.all([db.listCustomCategories(req.session.userId), db.listGroups(req.session.userId)]);
    res.json({ categories: custom.map(spendCats.toCategory), groups: spendCats.toGroups(g.groups, g.members) });
  } catch (e) { s2Fail(res, 'list categories', e); }
});

router.post('/v1/spending-categories', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const db = spendCatsDb();
    const names = await db.customCategoryNames(req.session.userId);
    const v = spendCats.validateCategoryInput(req.body, names);
    if (v.error) return res.status(400).json({ error: v.error });
    const row = await db.createCustomCategory(req.session.userId, v.category);
    res.json({ category: spendCats.toCategory(row) });
  } catch (e) { s2Fail(res, 'create category', e); }
});

router.patch('/v1/spending-categories/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const id = s2Id(req.params.id);
  if (!id) return res.status(404).json({ error: 'Category not found' });
  try {
    const db = spendCatsDb();
    const cur = await db.getCustomCategory(id, req.session.userId);
    if (!cur) return res.status(404).json({ error: 'Category not found' });
    const names = await db.customCategoryNames(req.session.userId);
    const v = spendCats.validateCategoryInput(req.body, names, { partial: true, currentName: cur.name });
    if (v.error) return res.status(400).json({ error: v.error });
    const row = await db.updateCustomCategory(id, req.session.userId, v.category);
    if (!row) return res.status(404).json({ error: 'Category not found' });
    res.json({ category: spendCats.toCategory(row) });
  } catch (e) { s2Fail(res, 'update category', e); }
});

router.delete('/v1/spending-categories/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const id = s2Id(req.params.id);
  if (!id) return res.status(404).json({ error: 'Category not found' });
  try {
    const ok = await spendCatsDb().deleteCustomCategory(id, req.session.userId);
    if (!ok) return res.status(404).json({ error: 'Category not found' });
    res.json({ ok: true });
  } catch (e) { s2Fail(res, 'delete category', e); }
});

async function s2KnownCategories(db, userId) {
  const { GROUPS } = require('../lib/transaction-categories');
  return [...GROUPS, ...(await db.customCategoryNames(userId))];
}

router.post('/v1/spending-category-groups', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const db = spendCatsDb();
    const [known, g] = await Promise.all([s2KnownCategories(db, req.session.userId), db.listGroups(req.session.userId)]);
    const v = spendCats.validateGroupInput(req.body, known, g.groups.map((x) => x.name));
    if (v.error) return res.status(400).json({ error: v.error });
    const row = await db.createGroup(req.session.userId, v.group);
    res.json({ group: { id: String(row.id), name: row.name, kind: row.kind, color: row.color, categories: v.group.categories } });
  } catch (e) { s2Fail(res, 'create group', e); }
});

router.patch('/v1/spending-category-groups/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const id = s2Id(req.params.id);
  if (!id) return res.status(404).json({ error: 'Group not found' });
  try {
    const db = spendCatsDb();
    const [known, g] = await Promise.all([s2KnownCategories(db, req.session.userId), db.listGroups(req.session.userId)]);
    const cur = g.groups.find((x) => String(x.id) === id);
    if (!cur) return res.status(404).json({ error: 'Group not found' });
    const v = spendCats.validateGroupInput(req.body, known, g.groups.map((x) => x.name), { partial: true, currentName: cur.name });
    if (v.error) return res.status(400).json({ error: v.error });
    const row = await db.updateGroup(id, req.session.userId, v.group);
    if (!row) return res.status(404).json({ error: 'Group not found' });
    res.json({ group: { id: String(row.id), name: row.name, kind: row.kind, color: row.color } });
  } catch (e) { s2Fail(res, 'update group', e); }
});

router.delete('/v1/spending-category-groups/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const id = s2Id(req.params.id);
  if (!id) return res.status(404).json({ error: 'Group not found' });
  try {
    const ok = await spendCatsDb().deleteGroup(id, req.session.userId);
    if (!ok) return res.status(404).json({ error: 'Group not found' });
    res.json({ ok: true });
  } catch (e) { s2Fail(res, 'delete group', e); }
});

// Transactions with their effective category (same rules as GET /v1/transactions,
// minus learned suggestions) for server-side budget maths.
async function s2CategorisedTransactions(userId) {
  const txnDb = require('../db/transactions');
  const { autoCategorize } = require('../lib/transaction-categories');
  const { detectTransactionRelationships, indexRelationships } = require('../services/transaction-relationships');
  const { getEffectiveTransactions } = require('../db/transaction-detail');
  const rows = await txnDb.getTransactionsWithCategory(userId, 2000);
  const relationships = indexRelationships(detectTransactionRelationships(rows));
  const annotated = rows.map((row) => ({
    ...row,
    relationship_type: relationships.get(String(row.id))?.type,
  }));
  const effective = await getEffectiveTransactions(userId, annotated);
  return effective.map((row) => {
    if (row.category_group) return row;
    const auto = autoCategorize(row.description, row.amount);
    return auto ? { ...row, category_group: auto.group, category: auto.category } : row;
  });
}

// GET /v1/budgets/suggestion — HEL-86 "Create a budget with Maal".
// The numbers come from shared/spending-breakdown.mjs suggestBudget() (pure,
// tested). The model (gateway 'cheap' role) only writes an explanation, which
// lib/budget-wording.js strips of any number it didn't receive. Works with no
// AI key and on the Free plan: the suggestion is returned without wording.
// When the wording is generated it uses one Ask Maal message from the plan.
// ?wording=0 skips the model (e.g. when the user only re-opens the builder).
// → { suggestion, wording: { summary, why[] } | null, wording_status }
router.get('/v1/budgets/suggestion', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  let suggestion;
  try {
    const [rows, stored] = await Promise.all([
      s2CategorisedTransactions(req.session.userId),
      require('../db/budgets').getSettings(req.session.userId),
    ]);
    const { normaliseSettings } = require('../lib/spending-settings');
    const { suggestBudget } = await import('../shared/spending-breakdown.mjs');
    suggestion = suggestBudget(rows, new Date(), normaliseSettings(stored).excluded_groups);
  } catch (e) { return s2Fail(res, 'budget suggestion', e); }

  let wording = null;
  let wordingStatus = 'skipped';
  if (suggestion.enoughData && req.query.wording !== '0') {
    const gateway = require('../services/gateway');
    if (!gateway.hasRole('cheap')) wordingStatus = 'unavailable';
    else {
      let allowed = true;
      try {
        const user = await findUserById(req.session.userId);
        const plan = await effectivePlanFor(user);
        const limit = planLimits.limitFor(plan, 'advisor_messages');
        if (limit <= 0) { allowed = false; wordingStatus = 'plan'; }
        else if ((await usageDb.incrementIfUnder(req.session.userId, 'advisor_messages', limit)) === null) {
          allowed = false; wordingStatus = 'limit';
        }
      } catch (e) {
        console.error('[usage] metering failed open for budget wording:', safeError(e));
      }
      if (allowed) {
        try {
          const bw = require('../lib/budget-wording');
          const { allowedFigures } = await import('../shared/spending-breakdown.mjs');
          const raw = await gateway.completeAs('cheap', bw.buildMessages(suggestion), { maxTokens: 400, temperature: 0.3, timeoutMs: 12000 });
          wording = bw.parseWording(raw, allowedFigures(suggestion));
          wordingStatus = wording ? 'ok' : 'failed';
        } catch (e) {
          console.error('[breakdown] budget wording failed:', safeError(e));
          wordingStatus = 'failed';
        }
      }
    }
  }
  res.json({ suggestion, wording, wording_status: wordingStatus });
});

// ─── Transactions depth: categories, rules, subscriptions (PR 6) ───────────
// All registered BEFORE /v1/:table so they aren't swallowed by the generic
// handler. Scoped to req.session.userId. Categories live in a separate table,
// so the protected `transactions` table is never altered.

// GET /v1/transaction-categories — the 18-group taxonomy for pickers.
// Session 2 – Breakdown & budget: the user's custom categories follow the 18
// built-in groups as extra top-level groups ({ group, categories: [], custom: true,
// id, kind, color, icon }) so every category picker offers them.
router.get('/v1/transaction-categories', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const custom = await spendCatsDb().listCustomCategories(req.session.userId);
    res.json({ groups: spendCats.mergeTaxonomy(custom) });
  } catch (e) {
    console.error('/api/v1/transaction-categories custom list failed:', safeError(e));
    res.json({ groups: spendCats.mergeTaxonomy([]) });
  }
});

// GET /v1/transactions — transactions with their category. Rows without a stored
// category get a best-effort auto-category for DISPLAY only (not persisted).
// Registered before the generic GET /v1/:table so it wins for this table.
router.post('/v1/transactions', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  let row, cashAccountId;
  try {
    const { normalizeImportedTransaction, normalizeManualCashAccountId } = require('../lib/transaction-import');
    const input = req.body?.data && typeof req.body.data === 'object' ? req.body.data : req.body;
    row = normalizeImportedTransaction(input);
    cashAccountId = normalizeManualCashAccountId(input?.cash_account_id);
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
    // HEL-114. Save the optional manual account link in this transaction and
    // leave the provider-observed details used by reconciliation untouched.
    if (cashAccountId) {
      const { linkManualCashAccount } = require('../db/transactions');
      const linked = await linkManualCashAccount(client, req.session.userId, inserted.rows[0].id, cashAccountId);
      if (!linked) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Cash account not found.' });
      }
    }
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
      console.error('Post-transaction-import quality check failed:', safeError(qualityError));
      try {
        await require('../services/data-quality').recordDataQualityFailure(req.session.userId, {
          trigger: 'transaction_import',
          coverage: { accounts: 'complete', transactions: 'failed' },
          message: qualityError.message,
        });
      } catch (recordError) {
        console.error('Could not record transaction-import quality failure:', safeError(recordError));
      }
    }
    return res.json(inserted.rows[0]);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('/api/v1/transactions POST error:', safeError(error));
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
    const { computeLearnedSuggestions } = require('../services/transaction-rules');
    const { detectTransactionRelationships, indexRelationships } = require('../services/transaction-relationships');
    const [rows, preferences] = await Promise.all([
      txnDb.getTransactionsWithCategory(req.session.userId, 500),
      txnDb.getLearnedCategoryPreferences(req.session.userId),
    ]);
    const learned = new Map(computeLearnedSuggestions(
      preferences, rows.filter((row) => !row.category_group)
    ).map((suggestion) => [String(suggestion.transaction_id), suggestion]));
    const relationships = indexRelationships(detectTransactionRelationships(rows));
    const out = rows.map((r) => {
      const relationship = relationships.get(String(r.id));
      const annotated = relationship ? { ...r, relationship_type: relationship.type, relationship_confidence: relationship.confidence } : r;
      if (annotated.category_group) return annotated;
      const suggestion = learned.get(String(r.id));
      if (suggestion) return {
        ...annotated,
        category_group: suggestion.category_group,
        category: suggestion.category,
        category_source: 'learned',
        category_confidence: suggestion.confidence,
      };
      const auto = autoCategorize(annotated.description, annotated.amount);
      return auto ? { ...annotated, category_group: auto.group, category: auto.category, category_source: 'auto' } : annotated;
    });
    // Session 2 – Transaction detail: additive hidden / reviewed / note /
    // merchant_name / tags / splits fields (side tables, user-scoped).
    const detailDb = require('../db/transaction-detail');
    const extras = await detailDb.getExtras(req.session.userId, out.map((r) => r.id));
    res.json(detailDb.attachExtras(out, extras));
  } catch (e) {
    console.error('/api/v1/transactions GET error:', safeError(e));
    res.status(500).json({ error: 'Could not load transactions' });
  }
});

// GET /v1/transactions/subscriptions — detected recurring payments.
router.get('/v1/transactions/subscriptions', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const txnDb = require('../db/transactions');
    const { detectSubscriptions } = require('../services/transaction-rules');
    const { getEffectivePayments } = require('../db/transaction-detail');
    const userId = req.session.userId;
    const txns = await txnDb.getTxnsForSubscriptions(userId, 400);
    res.json({ subscriptions: detectSubscriptions(await getEffectivePayments(userId, txns)) });
  } catch (e) {
    console.error('/api/v1/transactions/subscriptions error:', safeError(e));
    res.status(500).json({ error: 'Could not detect subscriptions' });
  }
});

// ─── Session 2 – Recurring (HEL-104/105) ─────────────────────────────────
// GET /v1/transactions/recurring merges auto-detected recurring bills,
// subscriptions and income (services/transaction-rules.js) with the user's
// manual items and decisions (recurring_items, db/recurring-items.js). Shape
// stays backward compatible: { recurring: [...] } with the detector's fields;
// each row gains additive `id`, `source: 'manual'|'detected'` and, for
// detected rows, `confirmed`. Merge/projection maths: shared/recurring.mjs
// (tested in test/recurring-items.test.js). All SQL is scoped to the session
// user. Registered before the generic /v1/:table handler.
router.get('/v1/transactions/recurring', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const txnDb = require('../db/transactions');
    const { detectRecurringTransactions } = require('../services/transaction-rules');
    const { detectTransactionRelationships, indexRelationships } = require('../services/transaction-relationships');
    const userId = req.session.userId;
    const manual = require('../db/recurring-items').listRecurringItems(userId).then(
      (rows) => ({ rows, failed: false }),
      (e) => {
        // Manual items are additive: still return detected rows, but flag it.
        console.error('/api/v1/transactions/recurring manual items error:', safeError(e));
        return { rows: [], failed: true };
      }
    );
    const rows = await txnDb.getTransactionsWithCategory(userId, 2000);
    const relationships = indexRelationships(detectTransactionRelationships(rows));
    const ordinaryRows = rows.map((row) => relationships.has(String(row.id))
      ? { ...row, relationship_type: relationships.get(String(row.id)).type }
      : row);
    const { getEffectivePayments } = require('../db/transaction-detail');
    const detected = detectRecurringTransactions(await getEffectivePayments(userId, ordinaryRows));
    const { mergeRecurring } = await import('../shared/recurring.mjs');
    const { rows: manualRows, failed: manualError } = await manual;
    const recurring = mergeRecurring(detected, manualRows);
    res.json(manualError ? { recurring, manual_error: true } : { recurring });
  } catch (error) {
    console.error('/api/v1/transactions/recurring error:', safeError(error));
    res.status(500).json({ error: 'Could not detect recurring transactions' });
  }
});

// Serialise a recurring_items row for the client.
async function recurringItemOut(row) {
  const { manualToRecurring } = await import('../shared/recurring.mjs');
  return { ...manualToRecurring(row), row_id: String(row.id), transaction_id: row.transaction_id || null };
}

// POST /v1/recurring-items/decisions — dismiss or confirm a detected row.
// Body: { source_key, status: 'dismissed' | 'confirmed' }.
router.post('/v1/recurring-items/decisions', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const sourceKey = String(req.body?.source_key || '').trim().slice(0, 80);
  const status = req.body?.status;
  if (!sourceKey) return res.status(400).json({ error: 'Missing recurring item.' });
  if (status !== 'dismissed' && status !== 'confirmed') return res.status(400).json({ error: 'Unknown action.' });
  try {
    const row = await require('../db/recurring-items').setDetectedDecision(req.session.userId, sourceKey, status);
    res.json({ ok: true, source_key: row.source_key, status: row.status });
  } catch (e) {
    console.error('/api/v1/recurring-items/decisions POST error:', safeError(e));
    res.status(500).json({ error: 'Could not save that change.' });
  }
});

// DELETE /v1/recurring-items/decisions/:sourceKey — undo a dismiss/confirm/edit
// for a detected row (it shows as detected again).
router.delete('/v1/recurring-items/decisions/:sourceKey', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const ok = await require('../db/recurring-items').clearDetectedDecision(req.session.userId, String(req.params.sourceKey).slice(0, 80));
    res.json({ ok });
  } catch (e) {
    console.error('/api/v1/recurring-items/decisions DELETE error:', safeError(e));
    res.status(500).json({ error: 'Could not undo that change.' });
  }
});

// GET /v1/recurring-items — the user's manual items (active rows only).
router.get('/v1/recurring-items', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const rows = await require('../db/recurring-items').listRecurringItems(req.session.userId);
    res.json({ items: await Promise.all(rows.filter((r) => r.status === 'active').map(recurringItemOut)) });
  } catch (e) {
    console.error('/api/v1/recurring-items GET error:', safeError(e));
    res.status(500).json({ error: 'Could not load your recurring items.' });
  }
});

// POST /v1/recurring-items — add a manual recurring item.
// Body: { name, amount, frequency, kind, next_date, category_group?, source_key?, transaction_id? }
router.post('/v1/recurring-items', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { validateRecurringInput } = await import('../shared/recurring.mjs');
    const v = validateRecurringInput(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const row = await require('../db/recurring-items').createRecurringItem(req.session.userId, v.item);
    if (!row) return res.status(404).json({ error: 'Transaction not found.' });
    res.status(201).json({ item: await recurringItemOut(row) });
  } catch (e) {
    console.error('/api/v1/recurring-items POST error:', safeError(e));
    res.status(500).json({ error: 'Could not save this recurring item.' });
  }
});

// PATCH /v1/recurring-items/:id — edit a manual item the user owns.
router.patch('/v1/recurring-items/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid recurring item.' });
  try {
    const { validateRecurringInput } = await import('../shared/recurring.mjs');
    const v = validateRecurringInput(req.body, { partial: true });
    if (v.error) return res.status(400).json({ error: v.error });
    const row = await require('../db/recurring-items').updateRecurringItem(req.session.userId, req.params.id, v.item);
    if (!row) return res.status(404).json({ error: 'Recurring item not found.' });
    res.json({ item: await recurringItemOut(row) });
  } catch (e) {
    console.error('/api/v1/recurring-items PATCH error:', safeError(e));
    res.status(500).json({ error: 'Could not update this recurring item.' });
  }
});

// DELETE /v1/recurring-items/:id — remove a manual item the user owns.
router.delete('/v1/recurring-items/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid recurring item.' });
  try {
    const ok = await require('../db/recurring-items').deleteRecurringItem(req.session.userId, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Recurring item not found.' });
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/v1/recurring-items DELETE error:', safeError(e));
    res.status(500).json({ error: 'Could not remove this recurring item.' });
  }
});
// ─── end Session 2 – Recurring ───────────────────────────────────────────

// PATCH /v1/transactions/:id/category — manually (re)categorise one transaction.
router.patch('/v1/transactions/:id/category', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { isKnownGroup, isValidCategory } = require('../lib/transaction-categories');
    const txnDb = require('../db/transactions');
    const d = (req.body && req.body.data && typeof req.body.data === 'object') ? req.body.data : (req.body || {});
    if (!isKnownGroup(d.category_group)) {
      // Session 2 – Breakdown & budget: a custom category is a top-level group with no sub-category.
      const customNames = await spendCatsDb().customCategoryNames(req.session.userId);
      if (!spendCats.isAssignableCategory(d.category_group, d.category, customNames)) return res.status(400).json({ error: 'Unknown category group.' });
      d.category = null;
    } else if (!isValidCategory(d.category_group, d.category)) return res.status(400).json({ error: 'Unknown category.' });
    const ok = await txnDb.setTransactionCategory(req.session.userId, req.params.id, d.category_group, d.category, 'manual');
    if (!ok) return res.status(404).json({ error: 'Transaction not found.' });
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/v1/transactions/:id/category error:', safeError(e));
    res.status(500).json({ error: 'Could not update category' });
  }
});

// ─── Session 2 – Transaction detail (HEL-96..103) ──────────────────────────
// Detail drawer + editing: reviewed / hidden / note / renamed merchant, tags,
// splits. Side tables only (migration 1757000000000) — `transactions` is never
// altered. Every handler is scoped to req.session.userId and the db layer
// proves ownership of the transaction before writing (IDOR guard). Category
// changes reuse PATCH /v1/transactions/:id/category above. Registered before
// the generic /v1/:table handler.
function txnDetailId(req, res) {
  const { toId } = require('../lib/transaction-detail');
  const id = toId(req.params.id);
  if (!id) { res.status(404).json({ error: 'Transaction not found.' }); return null; }
  return id;
}

// GET /v1/transactions/:id/detail — one transaction with account, meta, tags, splits.
router.get('/v1/transactions/:id/detail', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const id = txnDetailId(req, res); if (!id) return;
  try {
    const row = await require('../db/transaction-detail').getDetail(req.session.userId, id);
    if (!row) return res.status(404).json({ error: 'Transaction not found.' });
    if (!row.category_group) {
      const { autoCategorize } = require('../lib/transaction-categories');
      const auto = autoCategorize(row.description, row.amount);
      if (auto) Object.assign(row, { category_group: auto.group, category: auto.category, category_source: 'auto' });
    }
    res.json({ transaction: row });
  } catch (e) {
    console.error('/api/v1/transactions/:id/detail error:', safeError(e));
    res.status(500).json({ error: 'Could not load this transaction.' });
  }
});

// PATCH /v1/transactions/:id/meta — { hidden?, reviewed?, note?, merchant_name?, description? }
router.patch('/v1/transactions/:id/meta', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const id = txnDetailId(req, res); if (!id) return;
  const { validateMetaPatch } = require('../lib/transaction-detail');
  const v = validateMetaPatch(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  try {
    const db = require('../db/transaction-detail');
    if (!(await db.updateMeta(req.session.userId, id, v.patch))) return res.status(404).json({ error: 'Transaction not found.' });
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/v1/transactions/:id/meta error:', safeError(e));
    res.status(500).json({ error: 'Could not save that change.' });
  }
});

// PUT /v1/transactions/:id/tags — { tag_ids: [] } replaces the transaction's tags.
router.put('/v1/transactions/:id/tags', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const id = txnDetailId(req, res); if (!id) return;
  const { validateTagIds } = require('../lib/transaction-detail');
  const v = validateTagIds(req.body && req.body.tag_ids);
  if (v.error) return res.status(400).json({ error: v.error });
  try {
    const db = require('../db/transaction-detail');
    if (!(await db.setTransactionTags(req.session.userId, id, v.ids))) return res.status(404).json({ error: 'Transaction not found.' });
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/v1/transactions/:id/tags error:', safeError(e));
    res.status(500).json({ error: 'Could not save tags.' });
  }
});

// PUT /v1/transactions/:id/splits — { splits: [{ amount, category_group, category?, hidden? }] }
// Parts must sum exactly to the transaction (shared/transaction-splits.mjs),
// checked inside the DB transaction against the locked row.
router.put('/v1/transactions/:id/splits', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const id = txnDetailId(req, res); if (!id) return;
  const parts = req.body && req.body.splits;
  const { isKnownGroup, isValidCategory } = require('../lib/transaction-categories');
  // Session 2 – Breakdown & budget: the user's custom categories are valid parts too.
  let customNames = [];
  if (Array.isArray(parts) && parts.some((p) => p && p.category_group && !isKnownGroup(p.category_group))) {
    try { customNames = await spendCatsDb().customCategoryNames(req.session.userId); }
    catch (e) { console.error('[splits] custom categories unavailable:', safeError(e)); }
  }
  if (Array.isArray(parts) && parts.some((p) => p && p.category_group
    && (isKnownGroup(p.category_group) ? !isValidCategory(p.category_group, p.category || null)
      : !spendCats.isAssignableCategory(p.category_group, p.category || null, customNames)))) {
    return res.status(400).json({ error: 'Unknown category.' });
  }
  try {
    const { validateSplits } = await import('../shared/transaction-splits.mjs');
    const r = await require('../db/transaction-detail')
      .replaceSplits(req.session.userId, id, (amount) => validateSplits(amount, parts));
    if (r.notFound) return res.status(404).json({ error: 'Transaction not found.' });
    if (r.error) return res.status(400).json({ error: r.error, partErrors: r.partErrors });
    res.json({ splits: r.splits });
  } catch (e) {
    console.error('/api/v1/transactions/:id/splits error:', safeError(e));
    res.status(500).json({ error: 'Could not save the split.' });
  }
});

// DELETE /v1/transactions/:id/splits — remove a split (back to one transaction).
router.delete('/v1/transactions/:id/splits', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const id = txnDetailId(req, res); if (!id) return;
  try {
    if (!(await require('../db/transaction-detail').clearSplits(req.session.userId, id))) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/v1/transactions/:id/splits DELETE error:', safeError(e));
    res.status(500).json({ error: 'Could not remove the split.' });
  }
});

// POST /v1/transactions/bulk-edit — { ids, changes } (lib/transaction-detail validateBulkEdit).
// Used by the "Editing transactions" drawer (one or many selected rows).
router.post('/v1/transactions/bulk-edit', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const { validateBulkEdit } = require('../lib/transaction-detail');
  let customNames = [];
  try { customNames = await spendCatsDb().customCategoryNames(req.session.userId); } // Session 2 – Breakdown & budget
  catch (e) { console.error('[bulk-edit] custom categories unavailable:', safeError(e)); }
  const v = validateBulkEdit(req.body, customNames);
  if (v.error) return res.status(400).json({ error: v.error });
  try {
    const r = await require('../db/transaction-detail').bulkEdit(req.session.userId, v.ids, v.changes);
    if (!r.updated) return res.status(404).json({ error: 'Transaction not found.' });
    res.json(r);
  } catch (e) {
    console.error('/api/v1/transactions/bulk-edit error:', safeError(e));
    res.status(500).json({ error: 'Could not update those transactions.' });
  }
});

// Tags: list and create, or edit and delete one of the user’s tags.
router.get('/v1/tags', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { TAG_COLORS } = require('../lib/transaction-detail');
    res.json({ tags: await require('../db/transaction-detail').listTags(req.session.userId), colors: TAG_COLORS });
  } catch (e) {
    console.error('/api/v1/tags error:', safeError(e));
    res.status(500).json({ error: 'Could not load tags.' });
  }
});
router.post('/v1/tags', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const { validateTag } = require('../lib/transaction-detail');
  const v = validateTag(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  try {
    const r = await require('../db/transaction-detail').createTag(req.session.userId, v.tag);
    if (r.conflict) return res.status(409).json({ error: 'You already have a tag with that name.' });
    res.json({ tag: r.tag });
  } catch (e) {
    console.error('/api/v1/tags POST error:', safeError(e));
    res.status(500).json({ error: 'Could not create the tag.' });
  }
});
router.patch('/v1/tags/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const { toId, validateTagPatch } = require('../lib/transaction-detail');
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Tag not found.' });
  const result = validateTagPatch(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  try {
    const updated = await require('../db/transaction-detail').updateTag(req.session.userId, id, result.patch);
    if (!updated) return res.status(404).json({ error: 'Tag not found.' });
    if (updated.conflict) return res.status(409).json({ error: 'You already have a tag with that name.' });
    res.json({ tag: updated.tag });
  } catch (error) {
    console.error('/api/v1/tags PATCH error:', safeError(error));
    res.status(500).json({ error: 'Could not update the tag.' });
  }
});
router.delete('/v1/tags/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const { toId } = require('../lib/transaction-detail');
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Tag not found.' });
  try {
    if (!(await require('../db/transaction-detail').deleteTag(req.session.userId, id))) {
      return res.status(404).json({ error: 'Tag not found.' });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/v1/tags DELETE error:', safeError(e));
    res.status(500).json({ error: 'Could not delete the tag.' });
  }
});
// ─── end Session 2 – Transaction detail ────────────────────────────────────

// Rules CRUD + apply.
router.get('/v1/transaction-rules', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const txnDb = require('../db/transactions');
    res.json({ rules: await txnDb.listRules(req.session.userId) });
  } catch (e) {
    console.error('/api/v1/transaction-rules GET error:', safeError(e));
    res.status(500).json({ error: 'Could not load rules' });
  }
});

router.post('/v1/transaction-rules', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { normaliseRuleInput } = require('../services/transaction-rules');
    const txnDb = require('../db/transactions');
    const d = (req.body && req.body.data && typeof req.body.data === 'object') ? req.body.data : (req.body || {});
    const parsed = normaliseRuleInput(d, { requireCategory: true });
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const id = await txnDb.createRule(req.session.userId, parsed.rule);
    res.json({ ok: true, id, rule: { id, ...parsed.rule } });
  } catch (e) {
    console.error('/api/v1/transaction-rules POST error:', safeError(e));
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
    console.error('/api/v1/transaction-rules DELETE error:', safeError(e));
    res.status(500).json({ error: 'Could not delete rule' });
  }
});

// POST /v1/transaction-rules/apply — categorise all the user's transactions
// against their current rules (historical + incoming).
router.post('/v1/transaction-rules/apply', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const txnDb = require('../db/transactions');
    const { computeAssignments, withEffectiveCategory } = require('../services/transaction-rules');
    const [rules, rows] = await Promise.all([
      txnDb.listRules(req.session.userId),
      txnDb.getTransactionsWithCategory(req.session.userId, 2000),
    ]);
    // Never let a rule overwrite a category the user set by hand. Rules see the
    // effective (stored or auto) category, same as the preview endpoint.
    const eligible = withEffectiveCategory(rows).filter((r) => r.category_source !== 'manual');
    const assignments = computeAssignments(rules, eligible);
    const applied = await txnDb.applyCategoryAssignments(req.session.userId, assignments);
    res.json({ ok: true, applied });
  } catch (e) {
    console.error('/api/v1/transaction-rules/apply error:', safeError(e));
    res.status(500).json({ error: 'Could not apply rules' });
  }
});

// POST /v1/transaction-rules/preview — read-only: which of THIS user's
// transactions an unsaved rule would update. Uses the same pure
// selectRuleMatches as the apply endpoints, so preview == apply. Capped and
// paginated ({ limit ≤ 200, offset }). Writes nothing.
router.post('/v1/transaction-rules/preview', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const txnDb = require('../db/transactions');
    const { normaliseRuleInput, previewRuleMatches } = require('../services/transaction-rules');
    const body = req.body || {};
    const d = (body.data && typeof body.data === 'object') ? body.data : body;
    const parsed = normaliseRuleInput(d, { requireCategory: false });
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const rows = await txnDb.getTransactionsWithCategory(req.session.userId, 2000);
    res.json(previewRuleMatches(parsed.rule, rows, { limit: body.limit, offset: body.offset }));
  } catch (e) {
    console.error('/api/v1/transaction-rules/preview error:', safeError(e));
    res.status(500).json({ error: 'Could not preview matches' });
  }
});

// POST /v1/transaction-rules/:id/apply — apply ONE saved rule to its current
// matches, minus any the user unticked in the review step (exclude_ids), or
// only the ones they ticked (include_ids).
router.post('/v1/transaction-rules/:id/apply', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const txnDb = require('../db/transactions');
    const { selectRuleMatches, filterSelection, computeAssignments } = require('../services/transaction-rules');
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: 'Rule not found.' });
    const rule = await txnDb.getRule(req.session.userId, req.params.id);
    if (!rule) return res.status(404).json({ error: 'Rule not found.' });
    const rows = await txnDb.getTransactionsWithCategory(req.session.userId, 2000);
    const matches = filterSelection(selectRuleMatches(rule, rows), req.body || {});
    const applied = await txnDb.applyCategoryAssignments(req.session.userId, computeAssignments([rule], matches));
    res.json({ ok: true, applied });
  } catch (e) {
    console.error('/api/v1/transaction-rules/:id/apply error:', safeError(e));
    res.status(500).json({ error: 'Could not apply rule' });
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
    console.error('/api/v1/goals GET error:', safeError(e));
    res.json([]);
  }
});

const GOAL_POST_FIELDS = new Set([
  'id', 'name', 'category', 'description', 'source_type', 'target_kind',
  'target_pct', 'target_amount', 'current_amount', 'target_date',
]);

router.post('/v1/goals', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const goalsDb = require('../db/goals');
    const body = req.body || {};
    const unknownFields = Object.keys(body).filter((field) => !GOAL_POST_FIELDS.has(field));
    if (unknownFields.length) {
      return res.status(400).json({
        error: 'Unknown fields on goals.',
        unknown_fields: unknownFields,
      });
    }
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
    console.error('/api/v1/goals POST error:', safeError(e));
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
    console.error('/api/v1/goals PATCH error:', safeError(e));
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
    console.error('/api/v1/goals DELETE error:', safeError(e));
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
  // NOTE: 'account_reconciliation_adjustments' is deliberately EXCLUDED. Its
  // dedicated routes enforce append-only audit history; generic PATCH/DELETE
  // would violate that financial-integrity contract.
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

// ─── Session 2 – Reports (/app/spending/reports, HEL-106/HEL-107) ──────────
// Additive endpoints behind the Spending Reports page. Registered BEFORE the
// generic /v1/:table handler so 'report-views' is never treated as a table.
// Validation: lib/report-views.js (tested in test/spending-reports.test.js).
// Every db call passes req.session.userId; db/reports.js filters by user_id.
//
//   GET    /v1/reports/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD
//            → { from, to, transactions, truncated }  (≤ 3-year range, paged
//              server-side; GET /v1/transactions is unchanged)
//   GET    /v1/report-views          → { views }
//   POST   /v1/report-views          { name, config } → { view }
//   PATCH  /v1/report-views/:id      { name?, config? } → { view }
//   DELETE /v1/report-views/:id      → { ok }

router.get('/v1/reports/transactions', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const rv = require('../lib/report-views');
  const v = rv.validateRange(req.query.from, req.query.to);
  if (v.error) return res.status(400).json({ error: v.error });
  try {
    const reportsDb = require('../db/reports');
    const txnDb = require('../db/transactions');
    const { autoCategorize } = require('../lib/transaction-categories');
    const { computeLearnedSuggestions } = require('../services/transaction-rules');
    const { detectTransactionRelationships, indexRelationships } = require('../services/transaction-relationships');
    const [{ rows, truncated }, preferences] = await Promise.all([
      reportsDb.getTransactionsInRange(req.session.userId, v.from, v.to),
      txnDb.getLearnedCategoryPreferences(req.session.userId),
    ]);
    // Same annotation as GET /v1/transactions: own-account transfer legs,
    // then learned, then keyword categories for rows without a stored one.
    const learned = new Map(computeLearnedSuggestions(
      preferences, rows.filter((row) => !row.category_group)
    ).map((s) => [String(s.transaction_id), s]));
    const relationships = indexRelationships(detectTransactionRelationships(rows));
    const transactions = rows.map((r) => {
      const rel = relationships.get(String(r.id));
      const a = rel ? { ...r, relationship_type: rel.type, relationship_confidence: rel.confidence } : r;
      if (a.category_group) return a;
      const s = learned.get(String(r.id));
      if (s) return { ...a, category_group: s.category_group, category: s.category, category_source: 'learned', category_confidence: s.confidence };
      const auto = autoCategorize(a.description, a.amount);
      return auto ? { ...a, category_group: auto.group, category: auto.category, category_source: 'auto' } : a;
    });
    // Same additive hidden / reviewed_at / note / merchant_name / tags /
    // splits fields as GET /v1/transactions (Session 2 – Transaction detail),
    // so the client can run shared/transaction-splits.mjs effectiveTransactions().
    const detailDb = require('../db/transaction-detail');
    const extras = await detailDb.getExtras(req.session.userId, transactions.map((r) => r.id));
    res.json({ from: v.from, to: v.to, transactions: detailDb.attachExtras(transactions, extras), truncated });
  } catch (e) {
    console.error('/api/v1/reports/transactions error:', safeError(e));
    res.status(500).json({ error: 'Could not load transactions for this report' });
  }
});

router.get('/v1/report-views', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const rv = require('../lib/report-views');
    const views = await require('../db/reports').listViews(req.session.userId);
    res.json({ views: views.map(rv.toView) });
  } catch (e) {
    console.error('/api/v1/report-views GET error:', safeError(e));
    res.status(500).json({ error: 'Could not load saved reports' });
  }
});

router.post('/v1/report-views', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const rv = require('../lib/report-views');
  const v = rv.validateViewInput(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  try {
    const reportsDb = require('../db/reports');
    if (await reportsDb.countViews(req.session.userId) >= rv.MAX_VIEWS) {
      return res.status(400).json({ error: `You can save up to ${rv.MAX_VIEWS} reports. Delete one to save another.` });
    }
    const row = await reportsDb.createView(req.session.userId, v.view);
    res.status(201).json({ view: rv.toView(row) });
  } catch (e) {
    console.error('/api/v1/report-views POST error:', safeError(e));
    res.status(500).json({ error: 'Could not save this report' });
  }
});

router.patch('/v1/report-views/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  if (!/^\d{1,18}$/.test(req.params.id)) return res.status(404).json({ error: 'Saved report not found' });
  const rv = require('../lib/report-views');
  const v = rv.validateViewPatch(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  try {
    const row = await require('../db/reports').updateView(req.params.id, req.session.userId, v.patch);
    if (!row) return res.status(404).json({ error: 'Saved report not found' });
    res.json({ view: rv.toView(row) });
  } catch (e) {
    console.error('/api/v1/report-views PATCH error:', safeError(e));
    res.status(500).json({ error: 'Could not update this report' });
  }
});

router.delete('/v1/report-views/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  if (!/^\d{1,18}$/.test(req.params.id)) return res.status(404).json({ error: 'Saved report not found' });
  try {
    const ok = await require('../db/reports').deleteView(req.params.id, req.session.userId);
    if (!ok) return res.status(404).json({ error: 'Saved report not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/v1/report-views DELETE error:', safeError(e));
    res.status(500).json({ error: 'Could not delete this report' });
  }
});
// ─── end Session 2 – Reports ───────────────────────────────────────────────

// ─── Manual account net-worth fields ────────────────────────────────────────
const MANUAL_NET_WORTH_TABLES = new Set([
  'cash_accounts', 'investments', 'properties', 'debts', 'super_accounts', 'other_assets',
]);

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
  const writableColumns = (body) => Object.keys(body).filter((key) => /^\w+$/.test(key) && key.toLowerCase() !== ucol);
  const raw = req.query.filter;
  const { where, vals } = parseFilters(raw);
  const isSingle = req.query.single === '1';

  if (MANUAL_NET_WORTH_TABLES.has(table) && (req.method === 'POST' || req.method === 'PATCH')) {
    const { start_date: start, include_in_net_worth: included } = req.body || {};
    if (start != null && !require('../lib/data-quality').parsePostingDate(start)) {
      return res.status(400).json({ error: 'Start date must be a valid YYYY-MM-DD date.' });
    }
    if (included != null && typeof included !== 'boolean') {
      return res.status(400).json({ error: 'Show in net worth must be true or false.' });
    }
  }

  try {
    if (req.method === 'GET') {
      let q = `SELECT * FROM ${table} WHERE ${ucol} = $1${where} ORDER BY id ASC`;
      if (req.query.limit) q += ` LIMIT ${parseInt(req.query.limit, 10) || 100}`;
      const { rows } = await pool.query(q, [uid, ...vals]);
      return res.json(isSingle ? (rows[0] || null) : rows);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const keys = [...writableColumns(body), ucol];
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await pool.query(
        `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        keys.map(k => k === ucol ? uid : body[k])
      );
      return res.json(rows[0] || { ok: true });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      const keys = writableColumns(body);
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
    console.error(`api /v1/${table} ${req.method} error:`, safeError(e));
    if (req.method === 'GET') return res.json([]);
    if (req.method === 'POST') {
      const badField = unknownColumnMessage(e, table);
      if (badField) return res.status(400).json({ error: badField });
    }
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
