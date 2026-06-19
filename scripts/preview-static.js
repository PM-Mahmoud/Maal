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

// Serve React build assets at /assets/ (Vite builds here but Express serves from public/)
app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'app', 'assets')));


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
const { computeMaalScore } = require('../lib/maal-score');
const { estimateTax } = require('../lib/tax');
const { buildLandingContext } = require('../lib/landing-context');

// 30 days of plausible snapshots so the sparklines draw
const SNAP_DAYS = 200;
const snapshots = Array.from({ length: SNAP_DAYS }, (_, i) => {
  const drift = i * 70 + Math.sin(i / 7) * 1400;
  return {
    snap_date: new Date(Date.now() - (SNAP_DAYS - 1 - i) * 86400000).toISOString().slice(0, 10),
    net_worth: 30000 + drift,
    invest_balance: 22000 + drift * 0.35,
    super_balance: 34000 + i * 40,
    debts_total: 49000 - i * 18,
    cash_balance: 14000 + Math.sin(i / 5) * 2600 + i * 25,
  };
});
// Signed transactions over ~120 days for the in/out cash-flow view
const chartTxns = [];
for (let i = 0; i < 120; i++) {
  const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
  if (i % 14 === 0) chartTxns.push({ post_date: d, amount: 5400 });      // fortnightly salary in
  if (i % 3 === 0) chartTxns.push({ post_date: d, amount: -(40 + (i % 9) * 12) }); // spending out
  if (i % 30 === 5) chartTxns.push({ post_date: d, amount: -1850 });     // rent out
}

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
    ethicalScore: null, maalScore: computeMaalScore(eff.profile), snapshots,
    taxImpact: estimateTax(eff.profile), connected: eff.connected, chartTxns,
    recentTransactions: [
      { description: 'Woolworths Metro', amount: -84.20, post_date: new Date() },
      { description: 'Salary — NSW Health', amount: 5400, post_date: new Date(Date.now() - 2 * 86400000) },
      { description: 'Transport for NSW', amount: -12.40, post_date: new Date(Date.now() - 3 * 86400000) },
    ],
    movers: { top: [
      { symbol: 'NVDA', price: 1203.40, percent: 4.21 },
      { symbol: 'MSFT', price: 471.10, percent: 1.84 },
      { symbol: 'AAPL', price: 214.05, percent: 0.62 },
    ], bottom: [
      { symbol: 'TSLA', price: 178.22, percent: -3.10 },
      { symbol: 'AMZN', price: 184.70, percent: -1.42 },
    ] },
  }).then(html => res.send(html)).catch(next);
});
app.get('/roadmap', (_req, res, next) => {
  renderInLayout('dashboard-roadmap', {
    ...base, pageTitle: 'Roadmap',
    items: [
      { id: 1, title: 'Live market data for Top & Bottom Movers', details: 'Real-time ASX and US prices for your holdings.', status: 'planned', score: 12, upvotes: 13, downvotes: 1, my_vote: 1 },
      { id: 2, title: 'Radar email & SMS alerts', details: 'Scheduled radar runs that actually notify you.', status: 'in_progress', score: 8, upvotes: 8, downvotes: 0, my_vote: null },
      { id: 3, title: 'Statement parsing in Vault', details: 'Upload a PDF statement and Maal reads the transactions.', status: 'open', score: -1, upvotes: 2, downvotes: 3, my_vote: -1 },
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
app.get('/research', (_req, res, next) => {
  renderInLayout('dashboard-research', {
    ...base, pageTitle: 'Research', advisorReady: true,
    reports: [
      { id: 1, question: 'What if the ASX drops 20% next quarter — how exposed am I?', status: 'complete', created_at: new Date() },
      { id: 2, question: "Latest news affecting Australian bank shares?", status: 'complete', created_at: new Date(Date.now() - 86400000) },
    ],
  }).then(html => res.send(html)).catch(next);
});
app.get('/radar', (_req, res, next) => {
  renderInLayout('dashboard-radar', {
    ...base, pageTitle: 'Radar', advisorReady: true,
    radars: [
      { id: 1, prompt: 'Alert me if NVDA moves more than 10% in a day, and tell me what caused it', frequency: 'daily', notify_email: true, notify_sms: false, last_run_at: new Date(), last_alerted: true, last_result: 'NVDA fell 11% after soft data-centre guidance; broad AI-chip selloff.' },
      { id: 2, prompt: 'If my monthly spending goes 20% over average, alert me', frequency: 'weekly', notify_email: true, notify_sms: true, last_run_at: null, last_alerted: false, last_result: null },
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
    statementFiles: [{ id: 2, filename: 'cba-may-2026.csv', mime: 'text/csv', size_bytes: 5120, created_at: new Date() }],
  }).then(html => res.send(html)).catch(next);
});
app.get('/goals', (_req, res, next) => {
  renderInLayout('dashboard-goals', {
    ...base, pageTitle: 'Goals',
    goals: [
      { id: 1, name: 'Emergency fund', type: 'Save', target: 20000, current: 12500, created_at: new Date() },
      { id: 2, name: 'Pay off HECS', type: 'Pay Off', target: 42000, current: 8000, created_at: new Date() },
      { id: 3, name: 'House deposit', type: 'Grow', target: 150000, current: 31000, created_at: new Date() },
    ],
  }).then(html => res.send(html)).catch(next);
});
app.get('/vault', (_req, res, next) => {
  renderInLayout('dashboard-vault', {
    ...base, pageTitle: 'Vault',
    files: [
      { id: 1, filename: 'ATO-Notice-of-Assessment-2025.pdf', mime: 'application/pdf', size_bytes: 184320, created_at: new Date(), has_text: true },
      { id: 2, filename: 'AustralianSuper-statement-Q2.pdf', mime: 'application/pdf', size_bytes: 98304, created_at: new Date(Date.now() - 5 * 86400000), has_text: false },
    ],
  }).then(html => res.send(html)).catch(next);
});
app.get('/settings', (_req, res, next) => {
  renderInLayout('dashboard-settings', {
    ...base, pageTitle: 'Settings', billingStatus: null, billingPlanName: '',
  }).then(html => res.send(html)).catch(next);
});

// Mock endpoints so the Vault "Extract figures" flow can be exercised in preview.
app.post('/dashboard/vault/extract/:id', (_req, res) => {
  res.json({ ok: true, filename: 'ATO-Notice-of-Assessment-2025.pdf', fields: [
    { field: 'super_balance', label: 'Superannuation balance', amount: 38250 },
    { field: 'hecs_balance', label: 'HECS-HELP balance', amount: 41800 },
    { field: 'cash_savings', label: 'Cash & savings', amount: 18500 },
  ] });
});
app.post('/dashboard/assets/update', (_req, res) => res.json({ ok: true }));

// Additional public pages
app.get('/score', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'score.ejs'), {
    analyticsSnippet: '',
    themeCSS: '<link rel="stylesheet" href="/css/theme.css">',
    result: null, formData: null, error: null,
  }).then(html => res.send(html)).catch(next);
});
app.get('/pricing', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'pricing.ejs'), {
    analyticsSnippet: '',
    user: null,
  }).then(html => res.send(html)).catch(next);
});
app.get('/waitlist', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'waitlist.ejs'), {
    analyticsSnippet: '',
    user: null,
  }).then(html => res.send(html)).catch(next);
});
app.get('/signup', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'auth-signup.ejs'), {
    error: null, email: '',
  }).then(html => res.send(html)).catch(next);
});
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).send('<pre>' + (err.stack || err.message) + '</pre>');
});


// React SPA — serve public/app/index.html for all unmatched routes
const reactIndex = path.join(__dirname, '..', 'public', 'app', 'index.html');
const fs = require('fs');
app.use('*', (req, res) => {
  if (fs.existsSync(reactIndex)) {
    res.sendFile(reactIndex);
  } else {
    res.status(404).send('404 - React build not found. Run: cd client && npm run build');
  }
});

app.listen(port, () => console.log(`Preview on http://localhost:${port}`));
