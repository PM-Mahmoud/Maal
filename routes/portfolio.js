// routes/portfolio.js
// Serves /dashboard/portfolio — multi-step portfolio recommendation intake + allocation output.
// Does NOT own auth, profile storage, or Pool access.

const express = require('express');
const router = express.Router();
const { findUserById } = require('../db/users');
const { getProfileByUserId } = require('../db/profiles');

// ── Auth guard ────────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

router.use(requireAuth);

// Set dashboard-layout for all pages in this router
router.use(function(req, res, next) { res.locals.layout = 'app-layout'; next(); });

// ── Fund library ────────────────────────────────────────────────────────────────
// Mainstream, low-cost, broadly diversified AU/global ETFs across risk bands.

const FUNDS = [
  { ticker: 'VAS',  name: 'Vanguard Australian Shares',          alloc: 'AU Equities',    yld: '~3.8%',  exp: '0.07%' },
  { ticker: 'VGS',  name: 'Vanguard MSCI Intl Shares',           alloc: 'Intl Equities',  yld: '~1.9%',  exp: '0.18%' },
  { ticker: 'VDHG', name: 'Vanguard Diversified High Growth',    alloc: 'Equities',       yld: '~2.5%',  exp: '0.27%' },
  { ticker: 'VGE',  name: 'Vanguard FTSE Emerging Markets',      alloc: 'Intl Equities',  yld: '~2.8%',  exp: '0.48%' },
  { ticker: 'VAF',  name: 'Vanguard Australian Fixed Interest',  alloc: 'Fixed Income',   yld: '~4.2%',  exp: '0.10%' },
  { ticker: 'VGB',  name: 'Vanguard Australian Govt Bond',       alloc: 'Fixed Income',   yld: '~3.6%',  exp: '0.16%' },
  { ticker: 'VDCO', name: 'Vanguard Diversified Conservative',   alloc: 'Fixed Income',   yld: '~3.9%',  exp: '0.27%' },
  { ticker: 'AAA',  name: 'Betashares AU High Interest Cash',    alloc: 'Cash',           yld: '~4.3%',  exp: '0.18%' },
  { ticker: 'GOLD', name: 'Global X Physical Gold',              alloc: 'Precious Metals',yld: 'N/A',    exp: '0.40%' },
];

// ── Allocation presets ──────────────────────────────────────────────────────────

const PRESETS = {
  aggressive:   { equities: 90, fixed: 5,  metals: 5 },
  growth:       { equities: 75, fixed: 15, metals: 10 },
  balanced:     { equities: 55, fixed: 30, metals: 15 },
  conservative: { equities: 30, fixed: 50, metals: 20 },
};

// ── Allocation engine ───────────────────────────────────────────────────────────

function computeAllocation(inputs) {
  const { age, income, debtStatus, superBalance, goal, riskTolerance } = inputs;

  // 1. Age-based base profile
  let profile, equitiesTarget;
  if (age < 35)      { profile = 'aggressive';   equitiesTarget = 90; }
  else if (age < 50) { profile = 'growth';        equitiesTarget = 75; }
  else if (age < 65) { profile = 'balanced';     equitiesTarget = 55; }
  else               { profile = 'conservative'; equitiesTarget = 30; }

  // 2. Risk tolerance override — ±15% equities shift
  if (riskTolerance === 'aggressive' && age < 55)  equitiesTarget = Math.min(95, equitiesTarget + 15);
  if (riskTolerance === 'conservative')            equitiesTarget = Math.max(15, equitiesTarget - 15);

  // 3. Debt adjustment
  if (debtStatus === 'high') {
    equitiesTarget = Math.max(15, equitiesTarget - 10);
  }

  // 4. Super adequacy — below target: +5% growth
  if (superBalance === 'below') {
    equitiesTarget = Math.min(95, equitiesTarget + 5);
  }

  // Clip
  equitiesTarget = Math.max(10, Math.min(95, equitiesTarget));
  const fixedTarget = Math.max(0, 100 - equitiesTarget - 10); // reserve 10% metals floor
  const metalsTarget = 100 - equitiesTarget - fixedTarget;

  const alloc = {
    equities: equitiesTarget,
    fixed:    fixedTarget,
    metals:   metalsTarget,
  };

  // 5. "Why this" explanation
  const profileLabel = profile.charAt(0).toUpperCase() + profile.slice(1);
  let why = `Your ${profileLabel} base profile (age ${age}) drives a ${equitiesTarget}% equities allocation. `;
  if (riskTolerance !== 'moderate') {
    why += `Your ${riskTolerance} risk tolerance pushes this ${riskTolerance === 'aggressive' ? 'higher' : 'lower'}. `;
  }
  if (debtStatus === 'high') {
    why += `High debt levels reduce your growth exposure to preserve flexibility. `;
  }
  if (superBalance === 'below') {
    why += `Below-target superannuation increases your taxable account growth focus. `;
  }
  why += `The portfolio is built from low-cost, broadly diversified AU and global ETFs.`;

  return { profile, alloc, why };
}

// ── Select funds from library ──────────────────────────────────────────────────

function selectFunds(alloc) {
  const lib = FUNDS;

  // Map each slice to fund picks
  const picks = [];
  const equityCount = alloc.equities > 80 ? 4 : alloc.equities > 50 ? 3 : 2;
  const fixedCount  = alloc.fixed > 20 ? 2 : alloc.fixed > 0 ? 1 : 0;
  const metalCount  = alloc.metals > 0 ? (alloc.metals > 15 ? 2 : 1) : 0;

  const eqs  = lib.filter(f => f.alloc === 'Equities' || f.alloc === 'AU Equities' || f.alloc === 'Intl Equities').slice(0, equityCount);
  const fds  = lib.filter(f => f.alloc === 'Fixed Income' || f.alloc === 'Cash').slice(0, fixedCount);
  const mts  = lib.filter(f => f.alloc === 'Precious Metals').slice(0, metalCount);

  // Scale to allocation %
  const total = alloc.equities + alloc.fixed + alloc.metals;
  eqs.forEach(f => picks.push({ ...f, pct: Math.round((alloc.equities / total) * 100 / eqs.length) }));
  fds.forEach(f => picks.push({ ...f, pct: Math.round((alloc.fixed    / total) * 100 / fds.length) }));
  mts.forEach(f => picks.push({ ...f, pct: Math.round((alloc.metals   / total) * 100 / mts.length) }));

  // Fix rounding so they sum to 100
  const sum = picks.reduce((a, p) => a + p.pct, 0);
  if (picks.length > 0) picks[0].pct += (100 - sum);

  return picks;
}

// ── GET /dashboard/portfolio ────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const user = await findUserById(req.session.userId);
  const profile = await getProfileByUserId(req.session.userId);

  // Pre-fill from profile if available
  const prefill = profile ? {
    age: profile.age || '',
    income: '',
    debtStatus: '',
    superBalance: '',
    goal: '',
    riskTolerance: '',
  } : null;

  res.render('dashboard-portfolio', {
    user, profile,
    session: req.session,
    result: null,
    inputs: null,
    prefill,
    pageTitle: 'Portfolio',
  });
});

// ── POST /dashboard/portfolio ───────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const user = await findUserById(req.session.userId);
  const profile = await getProfileByUserId(req.session.userId);

  const { age, income, debtStatus, superBalance, goal, riskTolerance } = req.body;

  const inputs = {
    age:            parseInt(age, 10) || 35,
    income:         income || 'medium',
    debtStatus:     debtStatus || 'medium',
    superBalance:   superBalance || 'at',
    goal:           goal || 'retirement',
    riskTolerance:  riskTolerance || 'moderate',
  };

  const { profile: allocProfile, alloc, why } = computeAllocation(inputs);
  const fundPicks = selectFunds(alloc);

  const result = {
    allocProfile,
    alloc,
    why,
    fundPicks,
    income: inputs.income,
    goal: inputs.goal,
    riskTolerance: inputs.riskTolerance,
    age: inputs.age,
  };

  res.render('dashboard-portfolio', {
    user, profile,
    session: req.session,
    result,
    inputs,
    prefill: null,
    pageTitle: 'Portfolio',
  });
});

module.exports = router;