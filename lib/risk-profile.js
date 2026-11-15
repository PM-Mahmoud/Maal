'use strict';
// lib/risk-profile.js — Maal's risk assessment questionnaire + scoring.
//
// PURE: no I/O. The client renders QUESTIONS; the server re-scores the raw
// answers with scoreRiskProfile() and never trusts a profile sent by the client.
//
// The result maps onto the four mainstream risk bands used by the portfolio
// engine (client/src/lib/portfolio-plan.ts PlanInput["risk"]):
//   conservative | balanced | growth | high-growth
//
// Scoring:
//   - Every question option carries 0–3 points; the total is expressed as a
//     percentage of the maximum and banded (<35 conservative, <55 balanced,
//     <75 growth, else high-growth).
//   - Two guard rails cap the band regardless of points, because they describe
//     constraints rather than preferences:
//       * money needed within 3 years  → at most Conservative
//         money needed in 3–5 years    → at most Balanced
//       * would sell everything after a 20% fall → at most Balanced
//
// Education only — the band describes how the user answered, it is not a
// recommendation to buy or sell anything.

const VERSION = 1;

const PROFILES = ['conservative', 'balanced', 'growth', 'high-growth'];

const PROFILE_INFO = {
  conservative: {
    label: 'Conservative',
    summary: 'Lowest risk, lowest potential return',
    detail: 'You lean towards protecting what you have. Mixes described as conservative usually hold mostly cash and fixed interest, with a smaller share of shares, so the ups and downs tend to be smaller.',
  },
  balanced: {
    label: 'Balanced',
    summary: 'Moderate risk, moderate potential return',
    detail: 'You are comfortable with some ups and downs in exchange for growth over time. Balanced mixes typically split money between growth assets like ASX and global shares and defensive assets like bonds and cash.',
  },
  growth: {
    label: 'Growth',
    summary: 'Higher risk, higher potential return',
    detail: 'You can ride out larger falls for the chance of stronger long-term growth. Growth mixes usually hold mostly Australian and international shares with a smaller defensive buffer.',
  },
  'high-growth': {
    label: 'High Growth',
    summary: 'Highest risk, highest potential return',
    detail: 'You are prepared for big swings, including years where your balance falls, in pursuit of the highest long-term growth. High growth mixes hold almost entirely shares and other growth assets.',
  },
};

// Each question: id, kind ('choice' = one radio list; 'about' = the two-part
// "about you" step whose parts are scored as separate questions), title, options.
const QUESTIONS = [
  {
    id: 'goal',
    title: 'What do you most want your money to do?',
    options: [
      { value: 'protect', label: 'Keep it safe — I don’t want to lose any of it', points: 0 },
      { value: 'income', label: 'Earn a steady income with modest growth', points: 1 },
      { value: 'grow', label: 'Grow steadily over the long term', points: 2 },
      { value: 'maximise', label: 'Grow as much as possible, even with big swings', points: 3 },
    ],
  },
  {
    id: 'age_band',
    title: 'How old are you?',
    step: 'about',
    options: [
      { value: '60+', label: '60 or over', points: 0 },
      { value: '50-59', label: '50–59', points: 1 },
      { value: '40-49', label: '40–49', points: 2 },
      { value: '30-39', label: '30–39', points: 3 },
      { value: 'under-30', label: 'Under 30', points: 3 },
    ],
  },
  {
    id: 'income_stability',
    title: 'How secure is your income?',
    step: 'about',
    options: [
      { value: 'none', label: 'No regular income at the moment', points: 0 },
      { value: 'variable', label: 'It varies a lot (casual, contract, commission)', points: 1 },
      { value: 'stable', label: 'Fairly stable (permanent role or steady business)', points: 2 },
      { value: 'very_stable', label: 'Very secure, with other income or a strong safety net', points: 3 },
    ],
  },
  {
    id: 'horizon',
    title: 'When will you need most of this money?',
    options: [
      { value: 'lt3', label: 'Within 3 years', points: 0 },
      { value: '3to5', label: 'In 3 to 5 years', points: 1 },
      { value: '5to10', label: 'In 5 to 10 years', points: 2 },
      { value: '10plus', label: 'In more than 10 years (for example, at retirement through super)', points: 3 },
    ],
  },
  {
    id: 'drawdown',
    title: 'Your investments drop 20% in a month. What would you most likely do?',
    options: [
      { value: 'sell_all', label: 'Sell everything to stop further losses', points: 0 },
      { value: 'sell_some', label: 'Sell some and move it somewhere safer', points: 1 },
      { value: 'hold', label: 'Hold and wait for markets to recover', points: 2 },
      { value: 'buy_more', label: 'Invest more while prices are lower', points: 3 },
    ],
  },
  {
    id: 'range',
    title: 'You invest $10,000 for a year. Which range of outcomes sits best with you?',
    options: [
      { value: 'narrow', label: 'Worst case $9,700 — best case $10,500', points: 0 },
      { value: 'moderate', label: 'Worst case $9,000 — best case $11,200', points: 1 },
      { value: 'wide', label: 'Worst case $8,000 — best case $12,500', points: 2 },
      { value: 'widest', label: 'Worst case $7,000 — best case $14,000', points: 3 },
    ],
  },
  {
    id: 'experience',
    title: 'Which best describes your investing experience?',
    options: [
      { value: 'none', label: 'None beyond my bank account and super', points: 0 },
      { value: 'defensive', label: 'Term deposits or high-interest savings', points: 1 },
      { value: 'shares', label: 'I’ve bought ASX shares or ETFs', points: 2 },
      { value: 'experienced', label: 'Several years across shares, property or other assets', points: 3 },
    ],
  },
];

// Screens shown to the user (the "about you" step groups two scored questions).
const STEPS = (() => {
  const steps = [];
  for (const q of QUESTIONS) {
    if (q.step === 'about') {
      const existing = steps.find((s) => s.id === 'about');
      if (existing) existing.questions.push(q.id);
      else steps.push({ id: 'about', title: 'Tell us about you', questions: [q.id] });
    } else {
      steps.push({ id: q.id, title: q.title, questions: [q.id] });
    }
  }
  return steps;
})();

const MAX_POINTS = QUESTIONS.reduce((sum, q) => sum + Math.max(...q.options.map((o) => o.points)), 0);

function bandFor(pct) {
  if (pct < 35) return 'conservative';
  if (pct < 55) return 'balanced';
  if (pct < 75) return 'growth';
  return 'high-growth';
}

function capAt(profile, cap) {
  return PROFILES.indexOf(profile) > PROFILES.indexOf(cap) ? cap : profile;
}

// Keep only known question ids with known option values. Returns
// { answers, missing } — missing lists unanswered question ids in order.
function validateAnswers(raw) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const answers = {};
  const missing = [];
  for (const q of QUESTIONS) {
    const v = input[q.id];
    if (typeof v === 'string' && q.options.some((o) => o.value === v)) answers[q.id] = v;
    else missing.push(q.id);
  }
  return { answers, missing };
}

// Score a complete answer set. Returns null when any question is unanswered or
// invalid (callers must not save a partial assessment).
function scoreRiskProfile(raw) {
  const { answers, missing } = validateAnswers(raw);
  if (missing.length) return null;
  let points = 0;
  for (const q of QUESTIONS) points += q.options.find((o) => o.value === answers[q.id]).points;
  const pct = Math.round((points / MAX_POINTS) * 100);
  let profile = bandFor(pct);
  const caps = [];
  if (answers.horizon === 'lt3') { const c = capAt(profile, 'conservative'); if (c !== profile) caps.push('horizon'); profile = c; }
  if (answers.horizon === '3to5') { const c = capAt(profile, 'balanced'); if (c !== profile) caps.push('horizon'); profile = c; }
  if (answers.drawdown === 'sell_all') { const c = capAt(profile, 'balanced'); if (c !== profile) caps.push('drawdown'); profile = c; }
  return { profile, points, maxPoints: MAX_POINTS, pct, caps, answers, version: VERSION };
}

// The record persisted to user_profiles.onboarding_data.risk_profile.
function buildRecord(raw, now = new Date()) {
  const scored = scoreRiskProfile(raw);
  if (!scored) return null;
  return {
    profile: scored.profile,
    points: scored.points,
    max_points: scored.maxPoints,
    pct: scored.pct,
    caps: scored.caps,
    answers: scored.answers,
    version: scored.version,
    completed_at: now.toISOString(),
  };
}

// Normalise a stored record for the client (tolerates missing/old shapes).
function toClient(stored) {
  if (!stored || typeof stored !== 'object' || !PROFILES.includes(stored.profile)) return null;
  const info = PROFILE_INFO[stored.profile];
  return {
    profile: stored.profile,
    label: info.label,
    summary: info.summary,
    detail: info.detail,
    answers: validateAnswers(stored.answers).answers,
    completed_at: typeof stored.completed_at === 'string' ? stored.completed_at : null,
    version: Number(stored.version) || 1,
  };
}

// Questions as sent to the client — points stay server-side so the UI can't
// be "gamed" into a band and the scoring stays in one place.
function publicQuestions() {
  return {
    version: VERSION,
    steps: STEPS,
    questions: QUESTIONS.map((q) => ({
      id: q.id,
      title: q.title,
      options: q.options.map((o) => ({ value: o.value, label: o.label })),
    })),
    profiles: PROFILES.map((p) => ({ id: p, ...PROFILE_INFO[p] })),
  };
}

module.exports = {
  VERSION, PROFILES, PROFILE_INFO, QUESTIONS, STEPS, MAX_POINTS,
  validateAnswers, scoreRiskProfile, buildRecord, toClient, publicQuestions, bandFor,
};
