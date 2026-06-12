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
const { computeMizanScore } = require('../lib/mizan-score');
const { recordSnapshot, getSnapshots } = require('../db/snapshots');
const { estimateTax } = require('../lib/tax');
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
    const { user, profile, session } = await dashboardContext(req);
    const scores = await getScoresByUserId(req.session.userId, 3);
    const fhs = scores.find(s => s.score_type === 'financial_health');
    const shs = scores.find(s => s.score_type === 'super_health');
    const ehs = scores.find(s => s.score_type === 'ethical_score');

    // Mizan Score — single composite wellbeing score
    const mizanScore = computeMizanScore(profile);

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
      mizanScore,
      snapshots,
      taxImpact: estimateTax(profile),
      pageTitle: 'Dashboard'
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load dashboard.' });
  }
});

// ─── API: Ask Mizan chat (DeepSeek-powered) ──────────────────────────────────

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
    const mizan = computeMizanScore(profile);
    const reply = await advisor.chat(user, profile, mizan, clean);
    res.json({ ok: true, reply, live: advisor.hasAdvisor() });
  } catch (err) {
    console.error('ask/message error:', err.message);
    res.status(500).json({ error: 'The advisor hit a snag — try again in a moment.' });
  }
});

// ─── Pages: advisor suite (Ask Mizan, Research, Radar) ───────────────────────

router.get('/ask', async (req, res) => {
  try {
    const ctx = await dashboardContext(req);
    res.render('dashboard-ask', { ...ctx, pageTitle: 'Ask Mizan' });
  } catch (err) {
    console.error('/ask error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load Ask Mizan.' });
  }
});

router.get('/research', async (req, res) => {
  try {
    const ctx = await dashboardContext(req);
    res.render('dashboard-research', { ...ctx, pageTitle: 'Research' });
  } catch (err) {
    console.error('/research error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load Research.' });
  }
});

router.get('/radar', async (req, res) => {
  try {
    const ctx = await dashboardContext(req);
    res.render('dashboard-radar', { ...ctx, pageTitle: 'Radar' });
  } catch (err) {
    console.error('/radar error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load Radar.' });
  }
});

// ─── Pages: portfolio suite (Assets, Vault, Transactions, Goals) ─────────────

router.get('/assets', async (req, res) => {
  try {
    const ctx = await dashboardContext(req);
    res.render('dashboard-assets', { ...ctx, pageTitle: 'Assets & Liabilities', basiqEnabled: basiqService.hasBasiq() });
  } catch (err) {
    console.error('/assets error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load Assets & Liabilities.' });
  }
});

router.get('/vault', async (req, res) => {
  try {
    const ctx = await dashboardContext(req);
    res.render('dashboard-vault', { ...ctx, pageTitle: 'Vault' });
  } catch (err) {
    console.error('/vault error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load Vault.' });
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
    res.render('dashboard-transactions', {
      ...ctx,
      pageTitle: 'Transactions',
      basiqEnabled: basiqService.hasBasiq(),
      basiqStatus: req.query.basiq || null,
      basiqReason: req.query.reason || null,
      liveTransactions,
      liveAccounts,
    });
  } catch (err) {
    console.error('/transactions error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load Transactions.' });
  }
});

router.get('/goals', async (req, res) => {
  try {
    const ctx = await dashboardContext(req);
    res.render('dashboard-goals', { ...ctx, pageTitle: 'Goals' });
  } catch (err) {
    console.error('/goals error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load Goals.' });
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
    const planNames = { pro: 'Mizan Pro ($20/mo)', max: 'Mizan Max ($200/mo)' };
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

router.post('/profile',
  body('name').trim().isLength({ min: 1 }),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const ctx = await dashboardContext(req);
        const accounts = await getAccountsByUserId(req.session.userId);
        return res.render('dashboard-profile', {
          ...ctx, accounts, pageTitle: 'Profile', error: 'Name is required.', success: null
        });
      }
      const { updateName } = require('../db/users');
      await updateName(req.session.userId, req.body.name);
      req.session.name = req.body.name;

      const { user, profile, session } = await dashboardContext(req);
      const accounts = await getAccountsByUserId(req.session.userId);

      res.render('dashboard-profile', {
        user, profile, session, accounts,
        pageTitle: 'Profile',
        success: 'Profile updated.', error: null
      });
    } catch (err) {
      console.error('Update profile error:', err.message);
      const ctx = await dashboardContext(req);
      const accounts = await getAccountsByUserId(req.session.userId).catch(() => []);
      res.render('dashboard-profile', {
        ...ctx, accounts, pageTitle: 'Profile', error: 'Failed to update profile.', success: null
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

module.exports = router;