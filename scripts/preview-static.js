// scripts/preview-static.js
// Serves key pages rendered with mock locals (no database) so the design
// can be reviewed in a browser. Run: node scripts/preview-static.js
// Pages: / (landing), /login, /dashboard, /roadmap, /settings, /transactions

const express = require('express');
const ejs = require('ejs');
const path = require('path');

const VIEWS = path.join(__dirname, '..', 'views');
const app = express();
const port = process.env.PORT || 4173;

app.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));

const session = { userId: 1, name: 'Mahmoud Sair', email: 'preview@example.com' };
const user = {
  id: 1, email: 'preview@example.com', name: 'Mahmoud Sair', provider: 'credentials',
  email_verified: true, created_at: new Date(), plan: 'pro', basiq_user_id: 'demo',
  phone: null, two_factor_enabled: false,
};
const profile = {
  user_id: 1, profession: 'Doctor', specialty: 'GP', years_in_practice: 3,
  annual_income: 120000, hecs_balance: 42000, super_balance: 38000,
  investment_portfolio: 26000, property_value: 0, total_debt: 4000,
  cash_savings: 18500, monthly_expenses: 4200,
  goals: [], prefers_halal: true, prefers_esg: false, has_smsf: false,
  has_private_health: true, practice_owner: false, insurance_cover: 'partial',
  retirement_age: 60, onboarding_data: {}, completed_onboarding: true,
};
const { computeMizanScore } = require('../lib/mizan-score');
const { estimateTax } = require('../lib/tax');
const { buildLandingContext } = require('../lib/landing-context');

// 30 days of plausible snapshots so the sparklines draw
const snapshots = Array.from({ length: 30 }, (_, i) => {
  const drift = i * 120 + Math.sin(i / 3) * 900;
  return {
    snap_date: new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10),
    net_worth: 36500 + drift,
    invest_balance: 24000 + drift * 0.4,
    super_balance: 36000 + i * 60,
    debts_total: 46000 - i * 25,
  };
});

async function renderInLayout(view, locals) {
  const body = await ejs.renderFile(path.join(VIEWS, view + '.ejs'), locals);
  return ejs.renderFile(path.join(VIEWS, 'app-layout.ejs'), { ...locals, body });
}

const base = { session, user, profile };

app.get('/', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'layout.ejs'), buildLandingContext())
    .then(html => res.send(html)).catch(next);
});
app.get('/login', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'auth-login.ejs'), { error: null, email: '' })
    .then(html => res.send(html)).catch(next);
});
app.get('/dashboard', (_req, res, next) => {
  const score = { score_type: 'financial_health', score_value: 68, grade: 'Fair' };
  const { buildEffectiveProfile } = require('../lib/connected');
  const linked = [
    { account_reference: 'basiq:a1', institution_type: 'transaction', balance: 4250 },
    { account_reference: 'basiq:a2', institution_type: 'credit-card', balance: 1200 },
  ];
  const eff = buildEffectiveProfile(profile, linked);
  renderInLayout('dashboard-overview', {
    ...base, profile: eff.profile, pageTitle: 'Dashboard', financialScore: score, superScore: null,
    ethicalScore: null, mizanScore: computeMizanScore(eff.profile), snapshots,
    taxImpact: estimateTax(eff.profile), connected: eff.connected,
    recentTransactions: [
      { description: 'Woolworths Metro', amount: -84.20, post_date: new Date() },
      { description: 'Salary — NSW Health', amount: 5400, post_date: new Date(Date.now() - 2 * 86400000) },
      { description: 'Transport for NSW', amount: -12.40, post_date: new Date(Date.now() - 3 * 86400000) },
    ],
  }).then(html => res.send(html)).catch(next);
});
app.get('/roadmap', (_req, res, next) => {
  renderInLayout('dashboard-roadmap', {
    ...base, pageTitle: 'Roadmap',
    items: [
      { id: 1, title: 'Live market data for Top & Bottom Movers', details: 'Real-time ASX and US prices for your holdings.', status: 'planned', score: 12, upvotes: 13, downvotes: 1, my_vote: 1 },
      { id: 2, title: 'Radar email & SMS alerts', details: 'Scheduled radar runs that actually notify you.', status: 'in_progress', score: 8, upvotes: 8, downvotes: 0, my_vote: null },
      { id: 3, title: 'Statement parsing in Vault', details: 'Upload a PDF statement and Mizan reads the transactions.', status: 'open', score: -1, upvotes: 2, downvotes: 3, my_vote: -1 },
    ],
  }).then(html => res.send(html)).catch(next);
});
app.get('/settings', (_req, res, next) => {
  renderInLayout('dashboard-settings', {
    ...base, pageTitle: 'Settings', billingStatus: null, billingPlanName: '',
  }).then(html => res.send(html)).catch(next);
});
app.get('/accounts', (_req, res, next) => {
  renderInLayout('dashboard-accounts', {
    ...base, pageTitle: 'Linked Accounts', basiqEnabled: true,
    accounts: [
      { id: 1, institution_name: 'Hooli Bank', institution_type: 'bank', account_reference: 'basiq:abc1', balance: 4250, connection_status: 'active', last_synced_at: new Date() },
      { id: 2, institution_name: 'AustralianSuper', institution_type: 'super_fund', account_reference: '8821', balance: 38000, connection_status: 'connected', last_synced_at: null },
    ],
  }).then(html => res.send(html)).catch(next);
});
app.get('/profile', (_req, res, next) => {
  const profileWithOd = { ...profile, onboarding_data: {
    preferences: 'Plain language only. Maximise super first; prefer ethical investments.',
    dob: '1996-04-12', marital_status: 'Single', dependants: 0,
    tax_residency: 'Australian resident', state: 'NSW', salary_sacrifice: '$200 / fortnight',
    super_fund: 'AustralianSuper', super_option: 'Ethical / sustainable option',
    risk_tolerance: 'Growth', experience: 'Intermediate', ethical_screening: 'Halal framework',
  } };
  renderInLayout('dashboard-profile', {
    ...base, profile: profileWithOd, pageTitle: 'Profile', success: null, error: null,
  }).then(html => res.send(html)).catch(next);
});
app.get('/assets', (_req, res, next) => {
  renderInLayout('dashboard-assets', {
    ...base, pageTitle: 'Assets & Liabilities', basiqEnabled: true,
    liveAccounts: [
      { institution_name: 'Hooli Bank', institution_type: 'transaction', balance: 4250 },
      { institution_name: 'Hooli Saver', institution_type: 'savings', balance: 12200 },
    ],
    connected: { count: 2, cash: 16450, super: 0, invest: 0, debt: 0 },
  }).then(html => res.send(html)).catch(next);
});
app.get('/transactions', (_req, res, next) => {
  renderInLayout('dashboard-transactions', {
    ...base, pageTitle: 'Transactions', basiqEnabled: true, basiqStatus: null,
    basiqReason: null, liveTransactions: [], liveAccounts: [],
  }).then(html => res.send(html)).catch(next);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).send('<pre>' + (err.stack || err.message) + '</pre>');
});

app.listen(port, () => console.log(`Preview on http://localhost:${port}`));
