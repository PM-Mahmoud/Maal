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
  renderInLayout('dashboard-overview', {
    ...base, pageTitle: 'Dashboard', financialScore: score, superScore: null,
    ethicalScore: null, mizanScore: computeMizanScore(profile), snapshots,
    taxImpact: estimateTax(profile),
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
