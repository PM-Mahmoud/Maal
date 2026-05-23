/**
 * Score route — owns: GET /score (calculator UI), POST /score/calculate (compute + store result)
 * Does NOT own: email delivery, waitlist signup, onboarding wizard, user auth
 */
const express = require('express');
const router = express.Router();
const { computeScore } = require('../lib/score-engine');
const { saveScoreSubmission } = require('../db/score');
const { buildAnalyticsSnippet, buildThemeCSS } = require('../lib/landing-context');

// GET /score — render the multi-step calculator
router.get('/', (req, res) => {
  const slug = process.env.POLSIA_ANALYTICS_SLUG || '';
  res.render('score', { layout: false,
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
    profession: profession || 'health professional',
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

module.exports = router;
