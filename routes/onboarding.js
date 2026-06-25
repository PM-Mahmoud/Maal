// routes/onboarding.js
// Serves the onboarding wizard page and handles step-by-step data submission.
// Does NOT own business logic — delegates to db/onboarding.js.

const express = require('express');
const router = express.Router();
const {
  createSession,
  getSessionByUserId,
  updateSessionStep,
  completeSession,
  upsertResponse,
  getResponseByStep,
  getResponsesBySession,
  markResponseComplete
} = require('../db/onboarding');

const { upsertProfile } = require('../db/profiles');
const { saveScore } = require('../db/scores');
const { saveRecommendationsBatch } = require('../db/recommendations');
const { computeScore } = require('../lib/score-engine');

// ─── Auth guard ──────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

// ─── Middleware: attach userId to onboarding sessions ─────────────────────

function attachUserSession(req, res, next) {
  if (req.session.userId) {
    res.locals.userId = req.session.userId;
  }
  next();
}

router.use(attachUserSession);

// ─── Page: /onboarding ─────────────────────────────────────────────────────────

router.get('/', requireAuth, (req, res) => {
  res.render('onboarding', { layout: false });
});

// ─── API: init session (auth-aware) ─────────────────────────────────────────

router.post('/session', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    let session = await getSessionByUserId(userId);
    if (!session) {
      session = await createSession(userId);
    } else if (!session.user_id) {
      const { pool } = require('../db/auth');
      await pool.query(
        'UPDATE onboarding_sessions SET user_id = $1 WHERE id = $2',
        [userId, session.id]
      );
      session.user_id = userId;
    }
    res.json({ session_id: session.id, current_step: session.current_step, is_complete: session.is_complete });
  } catch (err) {
    console.error('POST /api/session error:', err.message);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// ─── API: get step data ────────────────────────────────────────────────────────

router.get('/session/:sessionId/step/:step', async (req, res) => {
  try {
    const { sessionId, step } = req.params;
    const data = await getResponseByStep(sessionId, parseInt(step, 10));
    res.json({ data: data || {} });
  } catch (err) {
    console.error('GET step error:', err.message);
    res.status(500).json({ error: 'Failed to load step data' });
  }
});

// ─── API: save step ─────────────────────────────────────────────────────────────

router.post('/step/:step', requireAuth, async (req, res) => {
  try {
    const step = parseInt(req.params.step, 10);
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id required' });
    }

    const { session_id: _sid, ...stepData } = req.body;
    const dataToSave = { ...stepData, user_id: req.session.userId };
    await upsertResponse(session_id, step, dataToSave);

    if (step < 7) {
      await updateSessionStep(session_id, step + 1);
    }

    res.json({ ok: true, next_step: step < 7 ? step + 1 : null });
  } catch (err) {
    console.error('POST /api/step error:', err.message);
    res.status(500).json({ error: 'Failed to save step' });
  }
});

// ─── API: complete onboarding ──────────────────────────────────────────────────
// On completion: sync data to user_profiles, run scoring engine, save scores.

router.post('/complete', requireAuth, async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });

    const userId = req.session.userId;

    // 1. Mark session complete
    await markResponseComplete(session_id);
    await completeSession(session_id);

    // 2. Get all step responses and merge into allData
    const responses = await getResponsesBySession(session_id);
    const allData = {};
    for (const r of responses) {
      const skipKeys = ['id','session_id','step','is_complete','completed_at','created_at','updated_at'];
      for (const f of Object.keys(r)) {
        if (!skipKeys.includes(f) && r[f] !== null && r[f] !== undefined) {
          allData[f] = r[f];
        }
      }
    }

    // 3. Map onboarding data → user profile fields
    const incomeMap = {
      '$80k–$120k': 100000,
      '$120k–$200k': 160000,
      '$200k–$350k': 275000,
      '$350k+': 400000
    };

    const profileData = {
      profession: allData.role || null,
      years_in_practice: parseInt(allData.years_in_practice, 10) || null,
      annual_income: incomeMap[allData.income_range] || 0,
      hecs_balance: parseFloat(allData.hecs_balance || allData.hecs_remaining) || 0,
      super_balance: parseFloat(allData.super_balance) || 0,
      total_debt: (parseFloat(allData.mortgage_balance) || 0)
                + (parseFloat(allData.investment_property_debt) || 0)
                + (parseFloat(allData.other_personal_debt) || 0),
      // Values-agnostic: columns retained for non-destructive DB compat, neutral default.
      prefers_halal: false,
      prefers_esg: false,
      has_smsf: allData.super_fund_type === 'smsf',
      practice_owner: allData.employment_type === 'business_owner',
      retirement_age: parseInt(allData.target_retirement_age, 10) || 65,
      insurance_cover: 'partial',
      onboarding_data: allData,
      completed_onboarding: true,
    };

    // 4. Save profile
    await upsertProfile(userId, profileData);

    // 5. Build score engine inputs from onboarding data
    const income = profileData.annual_income;
    const age = 25 + (profileData.years_in_practice || 0);
    const retirementAge = profileData.retirement_age || 65;

    // Parse investment allocation from brokerage accounts
    let investmentAllocation = [];
    try {
      let brokerageData = allData.brokerageAccounts;
      if (typeof brokerageData === 'string') {
        brokerageData = JSON.parse(brokerageData);
      }
      brokerageData = brokerageData || [];
      const totalBalance = brokerageData.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0);
      if (totalBalance > 0) {
        investmentAllocation = brokerageData.map(a => ({
          assetClass: (a.provider || 'Other').charAt(0).toUpperCase() + (a.provider || 'Other').slice(1),
          percentage: Math.round((parseFloat(a.balance) || 0) / totalBalance * 100)
        }));
      }
    } catch(e) { /* ignore */ }

    const scoreData = {
      age,
      annualIncome: income,
      hecsBalance: profileData.hecs_balance,
      otherDebtBalance: profileData.total_debt,
      superBalance: profileData.super_balance,
      investmentBalance: 0,
      insuranceCover: profileData.insurance_cover,
      retirementAge,
      employerContribRate: 11,
      investmentAllocation,
    };

    // 6. Compute scores
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

    // Save Super Health Score (derived from superAdequacy component × 5 = 0-100)
    const superScoreValue = Math.round(result.components.superAdequacy * 5);
    await saveScore(userId, {
      score_type: 'super_health',
      score_value: superScoreValue,
      grade: superScoreValue >= 80 ? 'Excellent' : superScoreValue >= 60 ? 'Good' : superScoreValue >= 40 ? 'Fair' : 'Needs Work',
      score_breakdown: { superAdequacy: result.components.superAdequacy },
      diagnosis: null,
    });

    // Save portfolio diversification signal under legacy 'ethical_score'
    // type for non-destructive DB compatibility (no longer surfaced in UI).
    await saveScore(userId, {
      score_type: 'ethical_score',
      score_value: result.halalComplianceScore,
      grade: result.halalComplianceScore >= 80 ? 'Excellent'
           : result.halalComplianceScore >= 60 ? 'Good'
           : result.halalComplianceScore >= 40 ? 'Fair' : 'Needs Work',
      score_breakdown: {},
      diagnosis: null,
    });

    // 7. Save recommendations
    if (result.recommendations && result.recommendations.length) {
      await saveRecommendationsBatch(userId, result.recommendations);
    }

    // 8. Send completion email
    try {
      const { sendEmail } = require('../services/email');
      const firstName = (req.session.name || '').split(' ')[0] || 'there';
      const baseUrl = process.env.BASE_URL || 'https://maal-2.polsia.app';
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0A0F0D;font-family:'DM Sans',system-ui,sans-serif;color:#F0EFE9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0F0D;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0F2E24;border:1px solid rgba(201,168,76,0.15);border-radius:16px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="padding:40px;">
          <p style="margin:0 0 24px;font-size:1.5rem;font-weight:600;color:#C9A84C;">◈ Maal</p>
          <h1 style="margin:0 0 16px;font-size:1.5rem;font-weight:600;">Your Financial Health Score is ready, ${firstName}.</h1>
          <p style="margin:0 0 20px;font-size:0.95rem;color:#8A8D83;line-height:1.7;">
            Your onboarding is complete and your scores have been calculated. Here's what you achieved:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
            <tr>
              <td style="padding:16px;background:rgba(255,255,255,0.04);border-radius:8px;text-align:center;">
                <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;color:#8A8D83;margin-bottom:8px;">Financial Health Score</div>
                <div style="font-size:2.5rem;font-weight:700;color:#C9A84C;">${result.score}<span style="font-size:1rem;color:#8A8D83;">/100</span></div>
                <div style="font-size:0.8rem;color:#7ED4A6;margin-top:4px;">${result.grade}</div>
              </td>
              <td style="width:12px;"></td>
              <td style="padding:16px;background:rgba(255,255,255,0.04);border-radius:8px;text-align:center;">
                <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;color:#8A8D83;margin-bottom:8px;">Super Health Score</div>
                <div style="font-size:2.5rem;font-weight:700;color:#C9A84C;">${superScoreValue}<span style="font-size:1rem;color:#8A8D83;">/100</span></div>
              </td>
            </tr>
          </table>
          <p style="margin:20px 0;font-size:0.875rem;color:#8A8D83;line-height:1.6;">${result.diagnosis}</p>
          <p style="margin:20px 0;">
            <a href="${baseUrl}/dashboard" style="display:inline-block;background:#C9A84C;color:#0A0F0D;font-weight:600;padding:0.85rem 2rem;border-radius:8px;text-decoration:none;font-size:0.95rem;">View Your Dashboard →</a>
          </p>
          <p style="margin:0;font-size:0.75rem;color:#8A8D83;line-height:1.5;">
            This score is for informational purposes only and does not constitute personal financial advice.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

      sendEmail({
        to: req.session.email,
        from: 'noreply@maal-2.polsia.app',
        subject: 'Your Financial Health Score is ready — Maal',
        html,
        text: `Your Financial Health Score is ${result.score}/100 (${result.grade}). View your dashboard: ${baseUrl}/dashboard`
      }).catch(emailErr => console.error('Completion email failed:', emailErr.message));
    } catch(emailErr) {
      console.error('Completion email setup failed:', emailErr.message);
    }

    res.json({
      ok: true,
      score: result.score,
      grade: result.grade,
      superScore: superScoreValue
    });
  } catch (err) {
    console.error('POST /api/complete error:', err.message);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

// ─── API: get all responses (for scores calculation) ─────────────────────────────

router.get('/profile/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (parseInt(userId, 10) !== req.session.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const session = await getSessionByUserId(parseInt(userId, 10));
    if (!session) return res.status(404).json({ error: 'No onboarding found' });

    const responses = await getResponsesBySession(session.id);
    res.json({ session, responses });
  } catch (err) {
    console.error('GET /api/profile error:', err.message);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

module.exports = router;