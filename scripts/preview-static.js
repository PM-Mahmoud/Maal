// scripts/preview-static.js
// Serves key pages rendered with mock locals (no database) so the design
// can be reviewed in a browser. Run: node scripts/preview-static.js
// Pages: / (landing), /login, /signup, public pages, and the retro previews.
//
// NOTE: The legacy EJS /dashboard/* is retired (server.js 301-redirects it to
// the React app at /app/*). This preview no longer renders those dead views —
// the real dashboard lives in the React app (client/src, served at /app).

const express = require('express');
const ejs = require('ejs');
const path = require('path');

const VIEWS = path.join(__dirname, '..', 'views');
const app = express();
const port = process.env.PORT || 4173;

app.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));

// Serve React build assets at /assets/ (Vite builds here but Express serves from public/)
app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'app', 'assets')));

const { buildLandingContext } = require('../lib/landing-context');

// ── Landing + auth ──────────────────────────────────────────
app.get('/', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'layout.ejs'), buildLandingContext())
    .then(html => res.send(html)).catch(next);
});
app.get('/login', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'auth-login.ejs'), { error: null, email: '' })
    .then(html => res.send(html)).catch(next);
});
app.get('/signup', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'auth-signup.ejs'), {
    error: null, email: '', name: '',
  }).then(html => res.send(html)).catch(next);
});
app.get('/forgot-password', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'auth-forgot-password.ejs'), { error: null, success: null })
    .then(html => res.send(html)).catch(next);
});
app.get('/reset-password', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'auth-reset-password.ejs'), { error: null, success: null, token: 'demo-token' })
    .then(html => res.send(html)).catch(next);
});
app.get('/verify-otp', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'auth-verify-otp.ejs'), { email: 'preview@example.com', error: null })
    .then(html => res.send(html)).catch(next);
});
app.get('/verify-email', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'auth-verify-email.ejs'), { success: true, error: null })
    .then(html => res.send(html)).catch(next);
});
app.get('/google-link', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'auth-google-link.ejs'), { email: 'preview@example.com' })
    .then(html => res.send(html)).catch(next);
});

// ── Public marketing pages ──────────────────────────────────
app.get('/score', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'score.ejs'), {
    analyticsSnippet: '',
    themeCSS: '<link rel="stylesheet" href="/css/theme.css">',
    result: null, formData: null, error: null,
  }).then(html => res.send(html)).catch(next);
});
app.get('/pricing', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'pricing.ejs'), { analyticsSnippet: '', user: null })
    .then(html => res.send(html)).catch(next);
});
app.get('/waitlist', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'waitlist.ejs'), { analyticsSnippet: '', user: null })
    .then(html => res.send(html)).catch(next);
});
app.get('/about', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'about.ejs'), { analyticsSnippet: '', user: null })
    .then(html => res.send(html)).catch(next);
});
app.get('/security', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'security.ejs'), { analyticsSnippet: '', user: null })
    .then(html => res.send(html)).catch(next);
});
app.get('/financial-wellbeing-score', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'financial-wellbeing-score.ejs'), { analyticsSnippet: '', user: null })
    .then(html => res.send(html)).catch(next);
});
app.get('/contact', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'contact.ejs'), {
    analyticsSnippet: '',
    user: null, success: false, name: '', email: '', message: '',
  }).then(html => res.send(html)).catch(next);
});

// ── Retro-futurist design preview (standalone landing + auth) ─
app.get('/retro', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'retro-preview.ejs'), {})
    .then(html => res.send(html)).catch(next);
});
app.get('/retro/login', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'retro-login-preview.ejs'), {})
    .then(html => res.send(html)).catch(next);
});

// ── Mock API for the React dashboard preview (no database) ──────
// Realistic local-only data so /app renders fully for design review.
// The real backend serves these endpoints with per-user data — these stubs
// exist only in this preview script and are never deployed.
const PREVIEW_USER = { id: 'preview-user', email: 'preview@maal.local', name: 'Alex Preview' };
const DAY = 86400000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();

app.get('/api/me', (_req, res) => res.json(PREVIEW_USER));

app.get('/api/v1/profile', (_req, res) => res.json({
  display_name: 'Alex Preview',
  age_band: '30-39', risk: 'balanced', age: 32,
  annual_income: 95000, super_balance: 68500, investment_portfolio: 20600,
  property_value: 0, total_debt: 34600, cash_savings: 21000,
  hecs_balance: 23400, monthly_expenses: 3200, retirement_age: 60,
  completed_onboarding: true, onboarded: true, created_at: iso(400),
}));

app.get('/api/v1/score', (_req, res) => res.json({
  score: 68, band: 'Strong', hasData: true,
  pillars: [
    { key: 'savings', label: 'Savings rate', score: 62, weight: 25, note: 'Saving ~14% of income' },
    { key: 'debt', label: 'Debt load', score: 58, weight: 25, note: 'HECS + car loan within healthy range' },
    { key: 'super', label: 'Super trajectory', score: 74, weight: 20, note: 'On track vs ASFA benchmark' },
    { key: 'trajectory', label: 'Wealth trajectory', score: 71, weight: 15, note: 'Net worth growing steadily' },
    { key: 'protection', label: 'Protection', score: 64, weight: 15, note: 'Cash buffer of ~6 months' },
  ],
  history: [
    { value: 55, at: iso(150) }, { value: 59, at: iso(120) }, { value: 61, at: iso(90) },
    { value: 64, at: iso(60) }, { value: 66, at: iso(30) }, { value: 68, at: iso(0) },
  ],
}));

app.get('/api/v1/snapshots', (req, res) => {
  const days = Math.min(Number(req.query.days) || 90, 366);
  const out = [];
  for (let i = days; i >= 0; i--) {
    const wave = Math.round(Math.sin(i / 9) * 350);
    const cash = 21000 - i * 9 + wave;
    const investments = 20600 - i * 3 + Math.round(Math.sin(i / 5) * 220);
    const sup = 68500 - i * 14;
    const debts = 34600 + i * 8;
    const assets = cash + investments + sup;
    out.push({ date: iso(i).slice(0, 10), netWorth: assets - debts, assets, super: sup, investments, debts, cash });
  }
  res.json(out);
});

app.get('/api/v1/transactions', (_req, res) => res.json([
  { id: 't1', description: 'Woolworths', amount: -86.40, post_date: iso(1), category_name: 'Groceries' },
  { id: 't2', description: 'Salary — Acme Pty Ltd', amount: 3650.00, post_date: iso(3), category_name: 'Income' },
  { id: 't3', description: 'Opal Transport', amount: -42.10, post_date: iso(4), category_name: 'Transport' },
  { id: 't4', description: 'Netflix', amount: -18.99, post_date: iso(6), category_name: 'Subscriptions' },
  { id: 't5', description: 'Origin Energy', amount: -132.55, post_date: iso(8), category_name: 'Utilities' },
  { id: 't6', description: 'ING interest', amount: 61.20, post_date: iso(10), category_name: 'Interest' },
  { id: 't7', description: 'Coles', amount: -64.75, post_date: iso(12), category_name: 'Groceries' },
  { id: 't8', description: 'Car loan repayment', amount: -410.00, post_date: iso(14), category_name: 'Debt repayment' },
]));

app.get('/api/v1/markets/indices', (_req, res) => res.json([
  { name: 'S&P 500', symbol: 'SPX', price: 6312.40, changePercent: 0.42 },
  { name: 'ASX 200', symbol: 'XJO', price: 8618.10, changePercent: 0.18 },
  { name: 'NASDAQ', symbol: 'IXIC', price: 20895.60, changePercent: 0.61 },
  { name: 'FTSE 100', symbol: 'UKX', price: 8992.30, changePercent: -0.12 },
  { name: 'Nikkei 225', symbol: 'N225', price: 39814.50, changePercent: 0.87 },
]));

app.get('/api/v1/markets/news', (_req, res) => res.json([
  { headline: 'ASX edges higher as miners rally on iron ore strength', summary: '', source: 'AFR', url: 'https://example.com/1', datetime: iso(0) },
  { headline: 'RBA holds rates steady, signals patience on inflation path', summary: '', source: 'ABC News', url: 'https://example.com/2', datetime: iso(1) },
  { headline: 'Wall Street notches fresh records as tech earnings beat', summary: '', source: 'Reuters', url: 'https://example.com/3', datetime: iso(1) },
  { headline: 'Australian dollar firms against greenback on commodities bid', summary: '', source: 'Bloomberg', url: 'https://example.com/4', datetime: iso(2) },
]));

app.get('/api/v1/markets/earnings', (_req, res) => res.json([
  { symbol: 'BHP', date: iso(9).slice(0, 10), epsEstimate: 2.41 },
  { symbol: 'CBA', date: iso(16).slice(0, 10), epsEstimate: 3.05 },
]));

app.get('/api/v1/goals', (_req, res) => res.json([
  { id: 'g1', name: 'House deposit', target_amount: 80000, current_amount: 21000, target_date: '2028-12-31' },
]));
app.get('/api/v1/vault', (_req, res) => res.json([]));
app.get('/api/v1/widgets', (_req, res) => res.json([]));
app.get('/api/v1/alerts', (_req, res) => res.json([
  { id: 'a1', name: 'BHP price watch', prompt: 'Alert me if BHP drops more than 5% in a week', active: true, last_status: 'OK' },
]));
app.get('/api/v1/notifications', (_req, res) => res.json([]));
app.get('/api/v1/notification-prefs', (_req, res) => res.json({}));
app.get('/api/v1/advisor/memory', (_req, res) => res.json({ memory: null, custom_instructions: null }));
app.get('/api/v1/basiq/status', (_req, res) => res.json({ connected: false }));
app.get('/api/v1/transaction-categories', (_req, res) => res.json([]));
app.get('/api/v1/transaction-rules', (_req, res) => res.json([]));
app.get('/api/v1/radar-templates', (_req, res) => res.json([]));
app.get('/api/v1/radar-template-versions', (_req, res) => res.json([]));
app.get('/api/v1/research', (_req, res) => res.json([]));
app.get('/api/v1/usage', (_req, res) => res.json({ plan: 'pro', usage: {} }));

// Generic table mocks for the supabase-compatible adapter (/api/v1/<table>)
const PREVIEW_TABLES = {
  incomes: [{ id: 'i1', source: 'Salary — Acme Pty Ltd', annual_amount: 95000 }],
  super_accounts: [{ id: 's1', name: 'AustralianSuper', balance: 68500 }],
  investments: [
    { id: 'inv1', name: 'VAS — Vanguard Australian Shares', value: 12400 },
    { id: 'inv2', name: 'VGS — Vanguard International Shares', value: 8200 },
  ],
  properties: [],
  cash_accounts: [
    { id: 'c1', name: 'ING Savings Maximiser', balance: 18600 },
    { id: 'c2', name: 'Everyday account', balance: 2400 },
  ],
  debts: [
    { id: 'd1', name: 'HECS-HELP', balance: 23400 },
    { id: 'd2', name: 'Car loan', balance: 11200 },
  ],
  profiles: [{ id: 'preview-user', display_name: 'Alex Preview' }],
  score_snapshots: [
    { id: 'ss1', total: 64, net_worth: 89000, created_at: iso(30) },
    { id: 'ss2', total: 68, net_worth: 96500, created_at: iso(0) },
  ],
  feedback: [], support_reports: [],
};
app.get('/api/v1/:table', (req, res, next) => {
  const rows = PREVIEW_TABLES[req.params.table];
  if (!rows) return next();
  res.json(req.query.single ? (rows[0] ?? null) : rows);
});

// Mutations + advisor: canned successes so preview clicks never error
app.post('/api/auth/login', (_req, res) => res.json({ user: PREVIEW_USER }));
app.post('/api/auth/signup', (_req, res) => res.json({ user: PREVIEW_USER }));
app.post('/api/auth/logout', (_req, res) => res.json({ ok: true }));
app.post('/api/v1/advisor/message', (_req, res) => res.json({
  reply: 'This is the local design preview — once connected to the live backend, I answer questions about your real finances here.',
  widgets: [], followUps: [], citations: [],
}));
app.use('/api', (req, res) => {
  if (req.method === 'GET') return res.json([]);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).send('<pre>' + (err.stack || err.message) + '</pre>');
});

// React SPA — serve public/app/index.html for all unmatched routes (the real dashboard)
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
