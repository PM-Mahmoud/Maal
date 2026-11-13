/**
 * Score route — owns: GET /score (calculator UI, incl. ?kiosk=1 event mode),
 * POST /score/calculate (compute + store result), POST /score/save (email the
 * free score + optional waitlist signup)
 * Does NOT own: email templates (services/email.js), waitlist rules
 * (lib/waitlist-gate.js), onboarding wizard, user auth
 */
const express = require('express');
const router = express.Router();
const { computeScore } = require('../lib/score-engine');
const { saveScoreSubmission } = require('../db/score');
const { buildAnalyticsSnippet, buildThemeCSS } = require('../lib/landing-context');
const { computeQuickScore } = require('../lib/quick-score');
const { saveWaitlistEmail } = require('../db/waitlist');
const { sendScoreReport } = require('../services/email');
const gate = require('../lib/waitlist-gate');
const { authLimiter } = require('../lib/rate-limiters');

// GET /score — render the multi-step calculator
router.get('/', (req, res) => {
  const slug = process.env.POLSIA_ANALYTICS_SLUG || '';
  res.render('score', { layout: false,
    // Event tablet mode: no site nav, touch-sized, resets between people.
    kiosk: req.query.kiosk === '1',
    themeCSS: buildThemeCSS(),
    analyticsSnippet: buildAnalyticsSnippet(slug),
    result: null,
    formData: null,
    error: null,
  });
});

// POST /score/calculate — compute score and render result
router.post('/calculate', async (req, res) => {
  const slug = process.env.POLSIA_ANALYTICS_SLUG || '';

  const {
    profession, stage, age,
    annualIncome, hecsBalance,
    otherDebtBalance, otherDebtRate,
    mortgageYesNo, mortgageBalance, mortgageRate,
    superBalance, employerContribRate,
    emergencyMonths, investmentBalance, monthlySavings,
  } = req.body || {};

  // Basic validation — age and income are required, must be non-empty strings
  // Use !== '' check so that valid 0 values pass (0 is not '')
  const incomeMissing = (annualIncome === undefined || annualIncome === null || annualIncome === '');
  const ageMissing = (age === undefined || age === null || age === '');
  if (incomeMissing || ageMissing) {
    return res.render('score', { layout: false,
      themeCSS: buildThemeCSS(),
      analyticsSnippet: buildAnalyticsSnippet(slug),
      result: null,
      formData: req.body,
      error: 'Please enter your age and gross annual income to calculate your score.',
    });
  }

  const formData = {
    profession: profession || 'everyday Australian',
    stage: stage || '',
    age: Number(age) ?? 30,
    annualIncome: Number(annualIncome) || 0,
    hecsBalance: Number(hecsBalance) || 0,
    otherDebtBalance: Number(otherDebtBalance) || 0,
    otherDebtRate: Number(otherDebtRate) || 0,
    mortgageYesNo: mortgageYesNo || 'no',
    mortgageBalance: Number(mortgageBalance) || 0,
    mortgageRate: Number(mortgageRate) || 0,
    superBalance: Number(superBalance) || 0,
    employerContribRate: Number(employerContribRate) || 11,
    emergencyMonths: Number(emergencyMonths) || 0,
    investmentBalance: Number(investmentBalance) || 0,
    monthlySavings: Number(monthlySavings) || 0,
  };

  const result = computeScore(formData);

  // Persist async — don't block the render
  saveScoreSubmission({ formData, result }).catch((err) => {
    console.error('[score] Submission save error:', err.message);
  });

  res.render('score', { layout: false,
    themeCSS: buildThemeCSS(),
    analyticsSnippet: buildAnalyticsSnippet(slug),
    result,
    formData,
    error: null,
  });
});

// POST /score/save — email the free score, and (with consent) join the waitlist.
// The score is recomputed here from the raw answers (lib/quick-score.js); the
// client-side number is never trusted for what we email. Consent gates ONLY the
// waitlist + updates: someone who asks for their score without ticking the box
// still gets that one email, and nothing else.
router.post('/save', authLimiter, async (req, res) => {
  const body = req.body || {};
  const email = gate.normaliseEmail(body.email);
  if (!email) return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });

  const consent = gate.parseConsent(body.consent);
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) || null : null;
  const report = computeQuickScore(body);

  // Anonymous analytics row (no email/name stored here).
  saveScoreSubmission({
    formData: { profession: 'everyday Australian', stage: 'quick-score', age: report.inputs.age, annualIncome: report.inputs.income },
    result: { score: report.total, grade: report.band, components: report.pillars, recommendations: report.nextSteps },
  }).catch((e) => console.error('[score/save] submission:', e.message));

  let waitlisted = false;
  if (consent) {
    try {
      await saveWaitlistEmail(email, { name, consent: true, source: gate.normaliseSource(body.source), score: report.total });
      waitlisted = true;
    } catch (e) {
      console.error('[score/save] waitlist:', e.message);
    }
  }

  let emailed = false;
  try {
    await sendScoreReport(email, { name, report, waitlisted });
    emailed = true;
  } catch (e) {
    console.error('[score/save] score email failed:', e.message);
  }

  if (!emailed && !waitlisted) {
    return res.status(502).json({ ok: false, error: 'We couldn’t send your score just now. Please try again.' });
  }
  res.json({ ok: true, emailed, waitlisted, score: report.total });
});

module.exports = router;
