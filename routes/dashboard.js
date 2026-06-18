// routes/dashboard.js
// Serves all /dashboard/* pages. All routes require authentication.
// Does NOT own Pool — delegates to db/*.

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const { findUserById } = require('../db/users');
const { getProfileByUserId, updateProfile } = require('../db/profiles');
const { getScoresByUserId, getLatestScoreByUserId, saveScore } = require('../db/scores');
const { getRecommendationsByUserId, updateRecommendationStatus, saveRecommendationsBatch } = require('../db/recommendations');
const { getAccountsByUserId, addAccount, deleteAccount, syncAccount } = require('../db/linked_accounts');
const { computeScore } = require('../lib/score-engine');
const { computeMaalScore } = require('../lib/maal-score');
const { recordSnapshot, getSnapshots } = require('../db/snapshots');
const { estimateTax } = require('../lib/tax');
const { buildEffectiveProfile } = require('../lib/connected');
const { getRecentTransactions, getTxnsSince } = require('../db/transactions');
const researchDb = require('../db/research');
const { runResearch } = require('../services/research');
const radarDb = require('../db/radar');
const radarService = require('../services/radar');
const marketdata = require('../services/marketdata');
const goalsDb = require('../db/goals');
const vaultDb = require('../db/vault');
const { extractText } = require('../services/extract');
const multer = require('multer');
const { superProjection, monteCarlo } = require('../lib/calc');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const advisor = require('../services/advisor');
const basiqService = require('../services/basiq');

// ─── Auth guard middleware ─────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

router.use(requireAuth);

// Set app-layout as the EJS layout for all dashboard pages
router.use(function(req, res, next) { res.locals.layout = 'app-layout'; next(); });

// ─── Shared context helper ─────────────────────────────────────────────────

async function dashboardContext(req) {
  const user = await findUserById(req.session.userId);
  const profile = await getProfileByUserId(req.session.userId);
  return { user, profile, session: req.session };
}

// ─── Page: /dashboard (overview) ────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { user, profile: rawProfile, session } = await dashboardContext(req);
    const scores = await getScoresByUserId(req.session.userId, 3);
    const fhs = scores.find(s => s.score_type === 'financial_health');
    const shs = scores.find(s => s.score_type === 'super_health');
    const ehs = scores.find(s => s.score_type === 'ethical_score');

    // Fold live Basiq balances into the manual entries — score, stats,
    // snapshots and templates all see the combined picture.
    const linkedAccounts = await getAccountsByUserId(req.session.userId).catch(() => []);
    const { profile, connected } = buildEffectiveProfile(rawProfile, linkedAccounts);

    // Recent synced transactions for the dashboard widget
    let recentTransactions = [];
    try { recentTransactions = await getRecentTransactions(req.session.userId, 6); }
    catch (e) { console.error('Recent transactions error (run migrations?):', e.message); }

    // Signed transactions for the in/out cash-flow charting on the tiles
    let chartTxns = [];
    try { chartTxns = await getTxnsSince(req.session.userId, 400); }
    catch (e) { /* table may not exist before migration */ }

    // Maal Score — single composite wellbeing score
    const maalScore = computeMaalScore(profile);

    // Top & bottom movers from live quotes (Finnhub) when configured
    let movers = null;
    if (marketdata.hasMarketData()) {
      try {
        const watch = (process.env.MAAL_WATCHLIST || 'AAPL,MSFT,NVDA,GOOGL,AMZN,TSLA,JPM,V')
          .split(',').map(s => s.trim()).filter(Boolean);
        const quotes = await marketdata.getQuotes(watch);
        if (quotes.length) {
          const sorted = quotes.slice().sort((a, b) => (b.percent || 0) - (a.percent || 0));
          movers = { top: sorted.slice(0, 3), bottom: sorted.slice(-3).reverse() };
        }
      } catch (e) { console.error('movers error:', e.message); }
    }

    // Record today's net-worth snapshot, then load history for the real chart
    const p = profile || {};
    const superBal  = Number(p.super_balance) || 0;
    const investBal = Number(p.investment_portfolio) || 0;
    const propertyV = Number(p.property_value) || 0;
    const cashBal   = Number(p.cash_savings) || 0;
    const debts     = (Number(p.hecs_balance) || 0) + (Number(p.total_debt) || 0);
    const assets    = superBal + investBal + propertyV + cashBal;
    let snapshots = [];
    try {
      await recordSnapshot(req.session.userId, {
        netWorth: assets - debts,
        assetsTotal: assets,
        superBalance: superBal,
        investBalance: investBal,
        debtsTotal: debts,
        cashBalance: cashBal,
      });
      snapshots = await getSnapshots(req.session.userId, 366);
    } catch (snapErr) {
      console.error('Snapshot error (run migrations?):', snapErr.message);
    }

    res.render('dashboard-overview', {
      user, profile, session,
      financialScore: fhs,
      superScore: shs,
      ethicalScore: ehs,
      maalScore,
      snapshots,
      connected,
      recentTransactions,
      chartTxns,
      movers,
      taxImpact: estimateTax(profile),
      pageTitle: 'Dashboard'
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load dashboard.' });
  }
});

// ─── API: Ask Maal chat (DeepSeek-powered) ──────────────────────────────────

router.post('/ask/message', async (req, res) => {
  try {
    const { messages } = req.body; // [{role:'user'|'assistant', content:string}, ...]
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'No messages.' });
    }
    const clean = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

    const { user, profile } = await dashboardContext(req);
    const maal = computeMaalScore(profile);
    let docs = [];
    try { docs = await vaultDb.getReadableDocs(req.session.userId); }
    catch (e) { console.error('vault docs for advisor failed:', e.message); }
    const reply = await advisor.chat(user, profile, maal, clean, docs);
    res.json({ ok: true, reply, live: advisor.hasAdvisor() });
  } catch (err) {
    console.error('ask/message error:', err.message);
    res.status(500).json({ error: 'The advisor hit a snag — try again in a moment.' });
  }
});

// ─── Pages: advisor suite (Ask Maal, Research, Radar) ───────────────────────

router.get('/ask', async (req, res) => {
  try {
    const ctx = await dashboardContext(req);
    res.render('dashboard-ask', { ...ctx, pageTitle: 'Ask Maal' });
  } catch (err) {
    console.error('/ask error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load Ask Maal.' });
  }
});

router.get('/research', async (req, res) => {
  try {
    const ctx = await dashboardContext(req);
    let reports = [];
    try { reports = await researchDb.listReports(req.session.userId, 20); }
    catch (e) { console.error('research history error (run migrations?):', e.message); }
    res.render('dashboard-research', {
      ...ctx, pageTitle: 'Research', reports,
      advisorReady: advisor.hasAdvisor(),
    });
  } catch (err) {
    console.error('/research error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load Research.' });
  }
});

// Run a research report synchronously (a few seconds) and persist it.
router.post('/research/run', async (req, res) => {
  try {
    const question = String(req.body.question || '').trim().slice(0, 600);
    if (!question) return res.status(400).json({ error: 'Ask a research question first.' });

    const { user, profile } = await dashboardContext(req);
    const maal = computeMaalScore(profile);
    const id = await researchDb.createReport(req.session.userId, question);
    try {
      const { report, sources } = await runResearch(user, profile, maal, question);
      await researchDb.completeReport(id, report, sources);
      res.json({ ok: true, id, report, sources, question });
    } catch (e) {
      console.error('research run failed:', e.message);
      await researchDb.failReport(id, 'The research engine hit a snag — please try again.');
      res.status(500).json({ error: 'The research engine hit a snag — please try again.' });
    }
  } catch (err) {
    console.error('research/run error:', err.message);
    res.status(500).json({ error: 'Could not start research.' });
  }
});

// Fetch a single saved report (history click)
router.get('/research/:id', async (req, res) => {
  try {
    const r = await researchDb.getReport(req.params.id, req.session.userId);
    if (!r) return res.status(404).json({ error: 'Report not found.' });
    res.json({ ok: true, report: r.report, sources: r.sources || [], question: r.question, status: r.status });
  } catch (err) {
    console.error('research/:id error:', err.message);
    res.status(500).json({ error: 'Could not load report.' });
  }
});

router.get('/radar', async (req, res) => {
  try {
    const ctx = await dashboardContext(req);
    let radars = [];
    try { radars = await radarDb.listRadars(req.session.userId); }
    catch (e) { console.error('radar list error (run migrations?):', e.message); }
    res.render('dashboard-radar', {
      ...ctx, pageTitle: 'Radar', radars, advisorReady: advisor.hasAdvisor(),
    });
  } catch (err) {
    console.error('/radar error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load Radar.' });
  }
});

router.post('/radar', async (req, res) => {
  try {
    const prompt = String(req.body.prompt || '').trim().slice(0, 600);
    if (!prompt) return res.status(400).json({ error: 'Describe what Maal should watch.' });
    const freq = ['daily', 'weekly', 'monthly'].includes(req.body.frequency) ? req.body.frequency : 'daily';
    const id = await radarDb.createRadar(req.session.userId, {
      prompt,
      symbols: radarService.extractSymbols(prompt),
      frequency: freq,
      notifyEmail: req.body.notifyEmail !== false,
      notifySms: !!req.body.notifySms,
    });
    res.json({ ok: true, id });
  } catch (err) {
    console.error('radar create error:', err.message);
    res.status(500).json({ error: 'Could not create radar.' });
  }
});

router.delete('/radar/:id', async (req, res) => {
  try {
    await radarDb.deleteRadar(req.params.id, req.session.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('radar delete error:', err.message);
    res.status(500).json({ error: 'Could not delete radar.' });
  }
});

// Run a radar on demand ("Run now")
router.post('/radar/:id/run', async (req, res) => {
  try {
    const result = await radarService.runRadar(req.params.id, req.session.userId);
    if (!result) return res.status(404).json({ error: 'Radar not found.' });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('radar run error:', err.message);
    res.status(500).json({ error: 'Radar run failed — try again.' });
  }
});

// ─── Pages: portfolio suite (Assets, Vault, Transactions, Goals) ─────────────

router.get('/assets', async (req, res) => {
  try {
    const ctx = await dashboardContext(req);
    // Live Basiq accounts shown separately from manual entries (no double-count)
    const allAccounts = await getAccountsByUserId(req.session.userId).catch(() => []);
    const liveAccounts = allAccounts.filter(a => String(a.account_reference || '').startsWith('basiq:'));
    const { connected } = buildEffectiveProfile(ctx.profile, allAccounts);
    res.render('dashboard-assets', {
      ...ctx, pageTitle: 'Assets & Liabilities',
      basiqEnabled: basiqService.hasBasiq(),
      liveAccounts, connected,
    });
  } catch (err) {
    console.error('/assets error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load Assets & Liabilities.' });
  }
});

router.get('/vault', async (req, res) => {
  try {
    const ctx = await dashboardContext(req);
    let files = [];
    try { files = await vaultDb.listFiles(req.session.userId, 'vault'); }
    catch (e) { console.error('vault list error (run migrations?):', e.message); }
    res.render('dashboard-vault', { ...ctx, pageTitle: 'Vault', files });
  } catch (err) {
    console.error('/vault error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load Vault.' });
  }
});

// Upload a document (Vault or a bank statement). Stored in Postgres bytea.
router.post('/vault/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file received.' });
    const kind = req.body.kind === 'statement' ? 'statement' : 'vault';
    // Pull readable text so Maal can answer from the doc + extract figures.
    // Best-effort: failure just means the file is stored but not yet readable.
    let extractedText = '';
    try { extractedText = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname); }
    catch (e) { console.error('extract on upload failed:', e.message); }
    const id = await vaultDb.addFile(req.session.userId, {
      kind,
      filename: String(req.file.originalname || 'document').slice(0, 255),
      mime: req.file.mimetype,
      size: req.file.size,
      content: req.file.buffer,
      extractedText,
    });
    res.json({ ok: true, id, filename: req.file.originalname, size: req.file.size, hasText: !!extractedText });
  } catch (err) {
    console.error('vault upload error:', err.message);
    res.status(500).json({ error: 'Upload failed.' });
  }
});

// Read a stored document and propose profile figures the user can apply.
// Returns candidates only — nothing is written until the user confirms via
// the existing /assets/update endpoint.
router.post('/vault/extract/:id', async (req, res) => {
  try {
    const doc = await vaultDb.getTextById(req.params.id, req.session.userId);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    if (!doc.extracted_text) {
      return res.json({ ok: true, fields: [], reason: 'no-text',
        message: 'Maal could not read text from this file. Scanned or image files need OCR (coming soon) — try a digital PDF, Word or CSV.' });
    }
    if (!advisor.hasAdvisor()) {
      return res.json({ ok: true, fields: [], reason: 'ai-unavailable',
        message: 'The AI isn’t configured on this server yet, so figures can’t be extracted.' });
    }
    const { fields, reason } = await advisor.extractFigures(doc.extracted_text);
    res.json({ ok: true, fields: fields || [], reason, filename: doc.filename });
  } catch (err) {
    console.error('vault extract error:', err.message);
    res.status(500).json({ error: 'Could not read that document.' });
  }
});

// List uploaded files of a kind (JSON) — used by the transactions statement list
router.get('/vault/list/:kind', async (req, res) => {
  try {
    const kind = req.params.kind === 'statement' ? 'statement' : 'vault';
    const files = await vaultDb.listFiles(req.session.userId, kind);
    res.json({ ok: true, files });
  } catch (err) {
    console.error('vault list error:', err.message);
    res.status(500).json({ error: 'Could not list files.' });
  }
});

// Download / view a stored file
router.get('/vault/file/:id', async (req, res) => {
  try {
    const f = await vaultDb.getFile(req.params.id, req.session.userId);
    if (!f) return res.status(404).render('error', { layout: false, message: 'File not found.' });
    res.setHeader('Content-Type', f.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${(f.filename || 'document').replace(/"/g, '')}"`);
    res.send(f.content);
  } catch (err) {
    console.error('vault download error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Could not load the file.' });
  }
});

router.delete('/vault/file/:id', async (req, res) => {
  try {
    await vaultDb.deleteFile(req.params.id, req.session.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('vault delete error:', err.message);
    res.status(500).json({ error: 'Could not delete file.' });
  }
});

router.get('/transactions', async (req, res) => {
  try {
    const ctx = await dashboardContext(req);
    // Live accounts + transactions if Basiq is configured and the user has connected
    let liveTransactions = [];
    let liveAccounts = [];
    if (basiqService.hasBasiq() && ctx.user.basiq_user_id) {
      try {
        [liveAccounts, liveTransactions] = await Promise.all([
          basiqService.getAccounts(ctx.user.basiq_user_id),
          basiqService.getTransactions(ctx.user.basiq_user_id, 25),
        ]);
      } catch (e) {
        console.error('Basiq fetch failed:', e.message);
      }
    }
    // Fall back to transactions persisted at sync time if the live call
    // returned nothing (API hiccup, expired consent, etc.)
    if (!liveTransactions.length) {
      try {
        const rows = await getRecentTransactions(req.session.userId, 25);
        liveTransactions = rows.map(r => ({
          description: r.description,
          amount: r.amount,
          postDate: r.post_date ? new Date(r.post_date).toISOString() : '',
        }));
      } catch (e) { /* table may not exist before migration */ }
    }
    let statementFiles = [];
    try { statementFiles = await vaultDb.listFiles(req.session.userId, 'statement'); }
    catch (e) { /* table may not exist before migration */ }
    res.render('dashboard-transactions', {
      ...ctx,
      pageTitle: 'Transactions',
      basiqEnabled: basiqService.hasBasiq(),
      basiqStatus: req.query.basiq || null,
      basiqReason: req.query.reason || null,
      liveTransactions,
      liveAccounts,
      statementFiles,
    });
  } catch (err) {
    console.error('/transactions error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load Transactions.' });
  }
});

router.get('/goals', async (req, res) => {
  try {
    const ctx = await dashboardContext(req);
    let goals = [];
    try { goals = await goalsDb.listGoals(req.session.userId); }
    catch (e) { console.error('goals list error (run migrations?):', e.message); }
    res.render('dashboard-goals', { ...ctx, pageTitle: 'Goals', goals });
  } catch (err) {
    console.error('/goals error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load Goals.' });
  }
});

router.post('/goals', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 120);
    const target = parseInt(req.body.target, 10);
    if (!name || isNaN(target) || target <= 0) return res.status(400).json({ error: 'Add a name and a target amount.' });
    const types = ['Grow', 'Save', 'Pay Off', 'Invest'];
    const type = types.includes(req.body.type) ? req.body.type : 'Save';
    const id = await goalsDb.createGoal(req.session.userId, { name, type, target, current: parseInt(req.body.current, 10) || 0 });
    res.json({ ok: true, id });
  } catch (err) {
    console.error('goal create error:', err.message);
    res.status(500).json({ error: 'Could not create goal.' });
  }
});

router.post('/goals/:id/progress', async (req, res) => {
  try {
    await goalsDb.updateGoalProgress(req.params.id, req.session.userId, parseInt(req.body.current, 10) || 0);
    res.json({ ok: true });
  } catch (err) {
    console.error('goal progress error:', err.message);
    res.status(500).json({ error: 'Could not update goal.' });
  }
});

router.delete('/goals/:id', async (req, res) => {
  try {
    await goalsDb.deleteGoal(req.params.id, req.session.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('goal delete error:', err.message);
    res.status(500).json({ error: 'Could not delete goal.' });
  }
});

// ─── API: update a single asset/liability field on the profile ───────────────

const ASSET_FIELDS = ['super_balance', 'investment_portfolio', 'property_value', 'cash_savings', 'monthly_expenses', 'hecs_balance', 'total_debt'];

router.post('/assets/update', async (req, res) => {
  try {
    const { field, amount } = req.body;
    if (!ASSET_FIELDS.includes(field)) return res.status(400).json({ error: 'Unknown field.' });
    const value = parseInt(amount, 10);
    if (isNaN(value) || value < 0) return res.status(400).json({ error: 'Invalid amount.' });

    const existing = (await getProfileByUserId(req.session.userId)) || {};
    const merged = { ...existing, [field]: value };
    await updateProfile(req.session.userId, merged);
    res.json({ ok: true });
  } catch (err) {
    console.error('assets/update error:', err.message);
    res.status(500).json({ error: 'Failed to save.' });
  }
});

// ─── API: clear/remove a manual asset or liability field ─────────────────────
router.post('/assets/remove', async (req, res) => {
  try {
    const { field } = req.body;
    if (!ASSET_FIELDS.includes(field)) return res.status(400).json({ error: 'Unknown field.' });

    const existing = (await getProfileByUserId(req.session.userId)) || {};
    const merged = { ...existing, [field]: null };
    await updateProfile(req.session.userId, merged);
    res.json({ ok: true });
  } catch (err) {
    console.error('assets/remove error:', err.message);
    res.status(500).json({ error: 'Failed to remove.' });
  }
});

// ─── API: persist a notification preference toggle ───────────────────────────

const NOTIFICATION_KEYS = ['portfolio_summary', 'market_alerts', 'research_reports', 'spending_alerts', 'score_changes', 'product_updates'];

router.post('/settings/notifications', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!NOTIFICATION_KEYS.includes(key)) return res.status(400).json({ error: 'Unknown preference.' });
    const { setNotificationPref } = require('../db/users');
    await setNotificationPref(req.session.userId, key, !!value);
    res.json({ ok: true });
  } catch (err) {
    console.error('settings/notifications error:', err.message);
    res.status(500).json({ error: 'Failed to save preference.' });
  }
});

// ─── API: toggle two-factor authentication ───────────────────────────────────

router.post('/settings/2fa', async (req, res) => {
  try {
    const { setTwoFactor } = require('../db/users');
    const enabled = !!req.body.enabled;
    await setTwoFactor(req.session.userId, enabled);
    res.json({ ok: true, enabled });
  } catch (err) {
    console.error('settings/2fa error:', err.message);
    res.status(500).json({ error: 'Failed to update two-factor authentication.' });
  }
});

// ─── Page: /dashboard/settings ───────────────────────────────────────────────

router.get('/settings', async (req, res) => {
  try {
    const ctx = await dashboardContext(req);
    const planNames = { pro: 'Maal Pro ($20/mo)', max: 'Maal Max ($200/mo)' };
    res.render('dashboard-settings', {
      ...ctx,
      pageTitle: 'Settings',
      billingStatus: req.query.billing || null,
      billingPlanName: planNames[req.query.plan] || '',
    });
  } catch (err) {
    console.error('/settings error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load Settings.' });
  }
});

// ─── Page: /dashboard/scores ─────────────────────────────────────────────────

router.get('/scores', async (req, res) => {
  try {
    const { user, profile, session } = await dashboardContext(req);
    const scores = await getScoresByUserId(req.session.userId, 50);
    const fhs = scores.find(s => s.score_type === 'financial_health');
    const shs = scores.find(s => s.score_type === 'super_health');
    const ehs = scores.find(s => s.score_type === 'ethical_score');

    // Historical scores for chart (last 20 per type)
    const fhsHistory = scores.filter(s => s.score_type === 'financial_health').slice(0, 20).reverse();
    const shsHistory = scores.filter(s => s.score_type === 'super_health').slice(0, 20).reverse();
    const ehsHistory = scores.filter(s => s.score_type === 'ethical_score').slice(0, 20).reverse();

    res.render('dashboard-scores', {
      user, profile, session,
      financialScore: fhs, superScore: shs, ethicalScore: ehs,
      fhsHistory, shsHistory, ehsHistory,
      pageTitle: 'Scores'
    });
  } catch (err) {
    console.error('/scores error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load scores.' });
  }
});

// ─── Page: /dashboard/scores/recalculate ────────────────────────────────────

router.post('/scores/recalculate', async (req, res) => {
  try {
    const userId = req.session.userId;
    const profile = await getProfileByUserId(userId);
    if (!profile || !profile.completed_onboarding) {
      return res.redirect('/onboarding');
    }

    const scoreData = {
      age: profile.years_in_practice ? 30 + (profile.years_in_practice || 0) : 30,
      annualIncome: profile.annual_income,
      hecsBalance: profile.hecs_balance,
      superBalance: profile.super_balance,
      investmentBalance: profile.investment_portfolio,
      propertyValue: profile.property_value,
      otherDebtBalance: profile.total_debt,
      insuranceCover: profile.insurance_cover || 'none',
      retirementAge: profile.retirement_age || 65,
      investmentAllocation: profile.onboarding_data?.investmentAllocation || [],
    };

    const result = computeScore(scoreData);

    // Save Financial Health Score
    await saveScore(userId, {
      score_type: 'financial_health',
      score_value: result.score,
      grade: result.grade,
      score_breakdown: result.components,
      diagnosis: result.diagnosis,
      halal_compliance_score: result.halalComplianceScore,
      portfolio_health_score: result.portfolioHealthScore,
      action_plan: result.recommendations,
    });

    // Save ethical score
    await saveScore(userId, {
      score_type: 'ethical_score',
      score_value: result.halalComplianceScore,
      grade: result.halalComplianceScore >= 80 ? 'Excellent'
           : result.halalComplianceScore >= 60 ? 'Good'
           : result.halalComplianceScore >= 40 ? 'Fair' : 'Needs Work',
      score_breakdown: {},
      diagnosis: null,
    });

    // Save recommendations
    if (result.recommendations.length) {
      await saveRecommendationsBatch(userId, result.recommendations);
    }

    res.redirect('/dashboard/scores');
  } catch (err) {
    console.error('recalculate error:', err.message);
    res.status(500).send('Recalculation failed: ' + err.message);
  }
});

// ─── Page: /dashboard/recommendations ───────────────────────────────────────

router.get('/recommendations', async (req, res) => {
  try {
    const { user, profile, session } = await dashboardContext(req);
    const filter = req.query.filter || 'all';
    const recs = await getRecommendationsByUserId(req.session.userId, filter);

    res.render('dashboard-recommendations', {
      user, profile, session,
      recommendations: recs, filter,
      pageTitle: 'Recommendations'
    });
  } catch (err) {
    console.error('/recommendations error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load recommendations.' });
  }
});

// ─── API: accept/dismiss recommendation ──────────────────────────────────────

router.post('/recommendations/:id/status', async (req, res) => {
  try {
    const { status } = req.body; // 'accepted' | 'dismissed'
    await updateRecommendationStatus(req.params.id, status);
    res.json({ ok: true });
  } catch (err) {
    console.error('Update rec status error:', err.message);
    res.status(500).json({ error: 'Failed to update recommendation.' });
  }
});

// ─── Page: /dashboard/accounts ────────────────────────────────────────────────

router.get('/accounts', async (req, res) => {
  try {
    const { user, profile, session } = await dashboardContext(req);
    const accounts = await getAccountsByUserId(req.session.userId);
    res.render('dashboard-accounts', {
      user, profile, session, accounts,
      basiqEnabled: basiqService.hasBasiq(),
      pageTitle: 'Linked Accounts'
    });
  } catch (err) {
    console.error('/accounts error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load accounts.' });
  }
});

// ─── API: add linked account ─────────────────────────────────────────────────

router.post('/accounts', async (req, res) => {
  try {
    const { institution_name, institution_type, account_reference, balance } = req.body;
    if (!institution_name) return res.status(400).json({ error: 'Institution name required.' });
    await addAccount(req.session.userId, {
      institution_name, institution_type, account_reference,
      balance: parseInt(balance, 10) || 0
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Add account error:', err.message);
    res.status(500).json({ error: 'Failed to add account.' });
  }
});

// ─── API: delete linked account ──────────────────────────────────────────────

router.delete('/accounts/:id', async (req, res) => {
  try {
    await deleteAccount(req.params.id, req.session.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete account error:', err.message);
    res.status(500).json({ error: 'Failed to delete account.' });
  }
});

// ─── API: sync linked account (updates last_synced_at) ───────────────────────
router.post('/accounts/:id/sync', async (req, res) => {
  try {
    await syncAccount(req.params.id, req.session.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Sync account error:', err.message);
    res.status(500).json({ error: 'Failed to sync account.' });
  }
});

// ─── Page: /dashboard/profile ───────────────────────────────────────────────

router.get('/profile', async (req, res) => {
  try {
    const { user, profile, session } = await dashboardContext(req);
    const accounts = await getAccountsByUserId(req.session.userId);
    res.render('dashboard-profile', {
      user, profile, session, accounts,
      pageTitle: 'Profile',
      success: null, error: null
    });
  } catch (err) {
    console.error('/profile error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load profile.' });
  }
});

// ─── API: update profile ──────────────────────────────────────────────────────

// Strip "$", commas and spaces from money inputs → integer
function parseMoney(v) {
  const n = parseInt(String(v == null ? '' : v).replace(/[^0-9.-]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

router.post('/profile',
  body('name').trim().isLength({ min: 1 }),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const ctx = await dashboardContext(req);
        return res.render('dashboard-profile', {
          ...ctx, pageTitle: 'Profile', error: 'Name is required.', success: null
        });
      }

      const b = req.body;
      const { updateName } = require('../db/users');
      await updateName(req.session.userId, b.name.trim());
      req.session.name = b.name.trim();

      // Merge onto the existing profile — upsertProfile overwrites every
      // column, so we must pass the full row, not just the changed fields.
      const existing = (await getProfileByUserId(req.session.userId)) || {};
      const ethical = b.ethical_screening || '';
      const merged = {
        ...existing,
        profession: (b.profession || '').trim() || null,
        years_in_practice: b.years_in_practice ? parseInt(b.years_in_practice, 10) : null,
        annual_income: parseMoney(b.annual_income),
        retirement_age: b.retirement_age ? parseInt(b.retirement_age, 10) : 65,
        hecs_balance: parseMoney(b.hecs_balance),
        super_balance: parseMoney(b.super_balance),
        has_private_health: b.private_health === 'yes',
        prefers_halal: ethical === 'Halal framework' || ethical === 'Both',
        prefers_esg: ethical === 'ESG / ethical framework' || ethical === 'Both',
        // Soft personalisation fields → JSONB (no schema churn)
        onboarding_data: {
          ...(existing.onboarding_data || {}),
          preferences: (b.preferences || '').trim(),
          dob: b.dob || '',
          marital_status: b.marital_status || '',
          dependants: b.dependants != null && b.dependants !== '' ? parseInt(b.dependants, 10) || 0 : 0,
          tax_residency: b.tax_residency || '',
          state: b.state || '',
          salary_sacrifice: (b.salary_sacrifice || '').trim(),
          super_fund: b.super_fund || '',
          super_option: b.super_option || '',
          risk_tolerance: b.risk_tolerance || '',
          experience: b.experience || '',
          ethical_screening: ethical,
        },
      };
      await updateProfile(req.session.userId, merged);

      const { user, profile, session } = await dashboardContext(req);
      res.render('dashboard-profile', {
        user, profile, session,
        pageTitle: 'Profile',
        success: 'Profile saved.', error: null
      });
    } catch (err) {
      console.error('Update profile error:', err.message);
      const ctx = await dashboardContext(req);
      res.render('dashboard-profile', {
        ...ctx, pageTitle: 'Profile', error: 'Failed to save profile.', success: null
      });
    }
  }
);

// ─── Page: /dashboard/history ────────────────────────────────────────────────

router.get('/history', async (req, res) => {
  try {
    const { user, profile, session } = await dashboardContext(req);
    const scores = await getScoresByUserId(req.session.userId, 100);
    const recs = await getRecommendationsByUserId(req.session.userId, 'all');
    res.render('dashboard-history', {
      user, profile, session, scores, recommendations: recs,
      pageTitle: 'History'
    });
  } catch (err) {
    console.error('/history error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load history.' });
  }
});

// ─── Helper: age from profile ───────────────────────────────────────────────

function ageFromProfile(profile) {
  const dob = profile && profile.onboarding_data && profile.onboarding_data.dob;
  if (dob) {
    let birth;
    if (dob.includes('/')) {
      const [d, m, y] = dob.split('/');
      birth = new Date(Number(y), Number(m) - 1, Number(d));
    } else {
      birth = new Date(dob);
    }
    if (!isNaN(birth.getTime())) {
      return Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 3600 * 1000));
    }
  }
  return Math.min(75, Math.max(22, 25 + (Number(profile && profile.years_in_practice) || 0)));
}

function maritalFromProfile(profile) {
  const raw = ((profile && profile.onboarding_data && profile.onboarding_data.marital_status) || '').toLowerCase();
  return raw.includes('married') || raw.includes('couple') || raw.includes('de facto') ? 'couple' : 'single';
}

// ─── Page: /dashboard/projections ───────────────────────────────────────────

router.get('/projections', async (req, res) => {
  try {
    const { user, profile, session } = await dashboardContext(req);
    const age          = ageFromProfile(profile);
    const salary       = Number(profile && profile.annual_income) || 0;
    const superBal     = Number(profile && profile.super_balance) || 0;
    const retirementAge = Number(profile && profile.retirement_age) || 67;
    const maritalStatus = maritalFromProfile(profile);
    const extra        = 0;

    const projection = superProjection({ currentBalance: superBal, salary, age, retirementAge, maritalStatus, extraAnnual: extra });
    const mc = monteCarlo({ currentBalance: superBal, salary, age, retirementAge, maritalStatus, simulations: 1000, seed: 42 });

    let narration = null;
    try {
      const { complete } = require('../services/advisor');
      const gap = mc.asfaTarget - mc.p50;
      const msgs = [
        { role: 'system', content: 'You are an educational financial wellness assistant for Maal, an Australian platform for health professionals. Keep responses factual, concise, and educational — never personal financial advice.' },
        { role: 'user', content: `Write a 3-sentence retirement projection summary for an Australian health professional (educational purposes only):
Age ${age}, salary $${salary.toLocaleString('en-AU')}, current super $${superBal.toLocaleString('en-AU')}, retiring at ${retirementAge}.
Median projection: $${mc.p50.toLocaleString('en-AU')} | ASFA comfortable target: $${mc.asfaTarget.toLocaleString('en-AU')} | Success rate: ${mc.successRate}%
${gap > 0 ? 'They have a gap of $' + Math.abs(gap).toLocaleString('en-AU') + ' to the ASFA comfortable target.' : 'They are on track or ahead of the ASFA comfortable target.'}
Mention projection uncertainty and that this is not financial advice.` }
      ];
      narration = await complete(msgs, { tier: 'strong', max_tokens: 180 });
    } catch (_e) { /* narration optional */ }

    res.render('dashboard-projections', {
      user, profile, session,
      age, salary, superBal, retirementAge, maritalStatus,
      projection, mc, narration,
      pageTitle: 'Projections'
    });
  } catch (err) {
    console.error('/projections error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load Projections.' });
  }
});

// ─── API: /dashboard/projections/what-if ────────────────────────────────────

router.get('/projections/what-if', async (req, res) => {
  try {
    const { profile } = await dashboardContext(req);
    const age          = ageFromProfile(profile);
    const salary       = Number(profile && profile.annual_income) || 0;
    const superBal     = Number(profile && profile.super_balance) || 0;
    const retirementAge = Number(profile && profile.retirement_age) || 67;
    const maritalStatus = maritalFromProfile(profile);
    const extra        = Math.max(0, Math.min(100000, Number(req.query.extra) || 0));

    const projection = superProjection({ currentBalance: superBal, salary, age, retirementAge, maritalStatus, extraAnnual: extra });
    const mc = monteCarlo({ currentBalance: superBal, salary, age, retirementAge, maritalStatus, simulations: 1000, seed: 42, extraAnnual: extra });

    res.json({ ok: true, projection, mc, extra });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;