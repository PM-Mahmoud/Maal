// scripts/preview-static.js
// Serves key pages rendered with mock locals (no database) so the design
// can be reviewed in a browser. Run: node scripts/preview-static.js
// Pages: / (landing), /login, /signup, public pages — plus a mock API layer
// so the React dashboard (/app) renders without a database.
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
app.get('/login', (req, res, next) => {
  // ?state=error | signedout previews the alert / notice banners.
  const s = req.query.state;
  ejs.renderFile(path.join(VIEWS, 'auth-login.ejs'), {
    error: s === 'error' ? 'Incorrect password. 2 attempts remaining before lockout.' : null,
    notice: s === 'signedout' ? 'You’ve been logged out. See you soon.' : null,
    email: s === 'error' ? 'mahmoud@example.com' : '', next: '',
  }).then(html => res.send(html)).catch(next);
});
app.get('/signup', (req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'auth-signup.ejs'), {
    // ?ref=1 previews arriving through a friend's referral link.
    referred: req.query.ref === '1', gated: req.query.ref !== '1',
    membership: require('../lib/membership'),
    error: null, email: '', name: '',
  }).then(html => res.send(html)).catch(next);
});
app.get('/forgot-password', (req, res, next) => {
  // ?state=sent previews "Check your email".
  ejs.renderFile(path.join(VIEWS, 'auth-forgot-password.ejs'), { error: null, sent: req.query.state === 'sent', email: '' })
    .then(html => res.send(html)).catch(next);
});
app.get('/reset-password', (req, res, next) => {
  // ?state=invalid | done previews the expired-link and success screens.
  const s = req.query.state;
  ejs.renderFile(path.join(VIEWS, 'auth-reset-password.ejs'), {
    error: s === 'invalid' ? 'This reset link is invalid or has expired. Request a new one below.' : null,
    success: s === 'done' ? true : null,
    token: s ? '' : 'demo-token',
  }).then(html => res.send(html)).catch(next);
});
app.get('/verify-otp', (req, res, next) => {
  // ?state=login previews the sign-in code (passwordless / 2FA) copy.
  ejs.renderFile(path.join(VIEWS, 'auth-verify-otp.ejs'), { email: 'mahmoud@example.com', error: null, purpose: req.query.state === 'login' ? 'login' : 'verify' })
    .then(html => res.send(html)).catch(next);
});
app.get('/verify-email', (req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'auth-verify-email.ejs'), { success: req.query.state !== 'failed', error: null })
    .then(html => res.send(html)).catch(next);
});
app.get('/google-link', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'auth-google-link.ejs'), { email: 'preview@example.com' })
    .then(html => res.send(html)).catch(next);
});

// ── Public marketing pages ──────────────────────────────────
app.get('/score', (req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'score.ejs'), {
    analyticsSnippet: '',
    themeCSS: '<link rel="stylesheet" href="/css/theme.css">',
    kiosk: req.query.kiosk === '1',
    result: null, formData: null, error: null,
  }).then(html => res.send(html)).catch(next);
});
// Mock of POST /score/save — no email is sent and nothing is stored in preview.
app.post('/score/save', express.json(), (req, res) => {
  const { computeQuickScore } = require('../lib/quick-score');
  const consent = req.body && (req.body.consent === true || req.body.consent === 'on');
  res.json({ ok: true, emailed: true, waitlisted: !!consent, score: computeQuickScore(req.body).total });
});
app.get('/pricing', (_req, res, next) => {
  ejs.renderFile(path.join(VIEWS, 'pricing.ejs'), { analyticsSnippet: '', user: null, membership: require('../lib/membership') })
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

// Six months of deterministic transactions (category_group = the 18-group AU
// taxonomy, as GET /api/v1/transactions returns). Feeds Home and the Spending
// overview. ?spend=empty on the page URL previews the no-data states.
const previewEmpty = (req) => /spend=empty/.test(req.headers.referer || '');
function previewTransactions() {
  const out = [];
  const now = new Date();
  const add = (d, description, amount, category_group, category, extra = {}) => {
    if (d > now) return;
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ id: `t${out.length + 1}`, description, amount, post_date: day, category_group, category, ...extra });
  };
  for (let k = 5; k >= 0; k--) {
    const y = now.getFullYear();
    const m = now.getMonth() - k;
    const at = (day) => new Date(y, m, day);
    const wobble = (n) => Math.round(Math.sin(k * 3 + n) * 1800) / 100; // ± $18, stable per month
    add(at(1), 'ING Savings Maximiser interest', 12.4 + k, 'Income', 'Interest');
    add(at(15), 'Salary — Acme Pty Ltd', 3650, 'Income', 'Salary & wages');
    add(at(29), 'Salary — Acme Pty Ltd', 3650, 'Income', 'Salary & wages');
    add(at(3), 'Rent — Ray White', -1950, 'Housing', 'Rent');
    add(at(6), 'Netflix', -18.99, 'Recurring & Subscriptions', 'Streaming');
    add(at(9), 'Spotify', -13.99, 'Recurring & Subscriptions', 'Streaming');
    add(at(8), 'AGL Energy', -132.55 + wobble(1), 'Bills & Utilities', 'Electricity');
    add(at(20), 'Telstra', -65, 'Bills & Utilities', 'Mobile');
    add(at(16), 'Transfer to savings', -500, 'Transfers', 'Internal transfer', { relationship_type: 'transfer' });
    add(at(24), 'NIB health insurance', -142.3, 'Financial', 'Insurance');
    [2, 9, 16, 23].forEach((d, i) => add(at(d), i % 2 ? 'Coles' : 'Woolworths', -(92 + wobble(d)), 'Food & Dining', 'Groceries'));
    [4, 11, 18, 25].forEach((d) => add(at(d), 'Opal Transport', -(38 + wobble(d) / 3), 'Auto & Transport', 'Public transport'));
    [5, 13, 21].forEach((d) => add(at(d), 'Single O Surry Hills', -(14.5 + wobble(d) / 4), 'Food & Dining', 'Cafes'));
    add(at(12), 'Uber Eats', -(46 + wobble(2)), 'Food & Dining', 'Delivery');
    add(at(10), k % 2 ? 'JB Hi-Fi' : 'Kmart', -(k % 2 ? 249 : 64.5), 'Shopping', k % 2 ? 'Electronics' : 'General retail');
    add(at(19), 'Priceline Pharmacy', -(28 + wobble(3) / 2), 'Health & Wellness', 'Pharmacy');
    add(at(22), 'Anytime Fitness', -21.95, 'Health & Wellness', 'Fitness');
    if (k === 2) add(at(14), 'Qantas', -389, 'Travel & Lifestyle', 'Flights');
    add(at(26), 'Card payment — CommBank', -620, 'Credit Card Payments', 'Card payment');
  }
  return out.sort((a, b) => b.post_date.localeCompare(a.post_date));
}
app.get('/api/v1/transactions', (req, res) => res.json(previewEmpty(req) ? [] : previewTransactions()));
// ── Session 2 – Recurring preview (HEL-104/105) ─────────────────────────────
// In-memory manual recurring items + dismiss/confirm decisions, merged into
// GET /api/v1/transactions/recurring exactly like routes/api.js does (via
// shared/recurring.mjs). Resets when the preview restarts.
// ?spend=empty on the page URL previews the empty state (no detected rows).
let pvRecurringRows = [];
let pvRecurringNextId = 1;
const pvRecurring = () => import('../shared/recurring.mjs');
async function pvMergeRecurring(detected) {
  const { mergeRecurring } = await pvRecurring();
  return mergeRecurring(detected, pvRecurringRows);
}
app.post('/api/v1/recurring-items/decisions', express.json(), (req, res) => {
  const key = String((req.body && req.body.source_key) || '');
  const status = req.body && req.body.status;
  if (!key || (status !== 'dismissed' && status !== 'confirmed')) return res.status(400).json({ error: 'Unknown action.' });
  pvRecurringRows = pvRecurringRows.filter((r) => r.source_key !== key).concat([{ id: pvRecurringNextId++, status, source_key: key }]);
  res.json({ ok: true, source_key: key, status });
});
app.delete('/api/v1/recurring-items/decisions/:key', (req, res) => {
  const n = pvRecurringRows.length;
  pvRecurringRows = pvRecurringRows.filter((r) => r.source_key !== req.params.key);
  res.json({ ok: pvRecurringRows.length < n });
});
app.get('/api/v1/recurring-items', async (_req, res) => {
  const { manualToRecurring } = await pvRecurring();
  res.json({ items: pvRecurringRows.filter((r) => r.status === 'active').map((r) => ({ ...manualToRecurring(r), row_id: String(r.id) })) });
});
app.post('/api/v1/recurring-items', express.json(), async (req, res) => {
  const { validateRecurringInput, manualToRecurring } = await pvRecurring();
  const v = validateRecurringInput(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const row = { id: pvRecurringNextId++, status: 'active', ...v.item };
  if (row.source_key) pvRecurringRows = pvRecurringRows.filter((r) => r.source_key !== row.source_key);
  pvRecurringRows.push(row);
  res.status(201).json({ item: { ...manualToRecurring(row), row_id: String(row.id) } });
});
app.patch('/api/v1/recurring-items/:id', express.json(), async (req, res) => {
  const { validateRecurringInput, manualToRecurring } = await pvRecurring();
  const v = validateRecurringInput(req.body, { partial: true });
  if (v.error) return res.status(400).json({ error: v.error });
  const row = pvRecurringRows.find((r) => String(r.id) === req.params.id && r.status === 'active');
  if (!row) return res.status(404).json({ error: 'Recurring item not found.' });
  Object.assign(row, v.item);
  res.json({ item: { ...manualToRecurring(row), row_id: String(row.id) } });
});
app.delete('/api/v1/recurring-items/:id', (req, res) => {
  const n = pvRecurringRows.length;
  pvRecurringRows = pvRecurringRows.filter((r) => String(r.id) !== req.params.id);
  if (pvRecurringRows.length === n) return res.status(404).json({ error: 'Recurring item not found.' });
  res.json({ ok: true });
});
// ── end Session 2 – Recurring preview ───────────────────────────────────────
// Mirrors services/transaction-rules.js detectRecurringTransactions() output.
app.get('/api/v1/transactions/recurring', (req, res) => {
  if (previewEmpty(req)) return pvMergeRecurring([]).then((recurring) => res.json({ recurring }));
  const now = new Date();
  const next = (day) => {
    let d = new Date(now.getFullYear(), now.getMonth(), day);
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = new Date(now.getFullYear(), now.getMonth() + 1, day);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const r = (kind, merchant, averageAmount, cadence, nextEstimate) => ({ kind, merchant, merchant_key: merchant.toLowerCase(), averageAmount, cadence, nextEstimate, confidence: 0.9, occurrences: 6 });
  pvMergeRecurring([
    r('income', 'Acme Pty Ltd', 3650, 'monthly', next(29)),
    r('bill', 'Rent — Ray White', 1950, 'monthly', next(3)),
    r('subscription', 'Netflix', 18.99, 'monthly', next(6)),
    r('subscription', 'Spotify', 13.99, 'monthly', next(9)),
    r('bill', 'AGL Energy', 132.55, 'monthly', next(8)),
    r('bill', 'Telstra', 65, 'monthly', next(20)),
    r('bill', 'Anytime Fitness', 21.95, 'monthly', next(22)),
    r('bill', 'NIB health insurance', 142.3, 'monthly', next(24)),
  ]).then((recurring) => res.json({ recurring }));
});

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
app.get('/api/v1/alerts', (_req, res) => res.json({
  alerts: [
    { id: 'a1', name: 'BHP price watch', prompt: 'Alert me if BHP drops more than 5% in a week', active: true, last_status: 'OK' },
  ],
  events: [],
}));
app.get('/api/v1/notifications', (_req, res) => res.json([]));
app.get('/api/v1/notification-prefs', (_req, res) => res.json({}));
app.get('/api/v1/advisor/memory', (_req, res) => res.json({ memory: null, customInstructions: null }));
// ?banks=live on the page URL previews the live Basiq connect step.
app.get('/api/v1/basiq/status', (req, res) => res.json({ connected: false, live: /banks=live/.test(req.headers.referer || '') }));
app.patch('/api/v1/profile', express.json(), (req, res) => res.json({ ...req.body, ok: true }));
// Spending settings preview (in-memory; mirrors routes/spending-settings.js shapes).
{
  const { TAXONOMY } = require('../lib/transaction-categories');
  const ss = require('../lib/spending-settings');
  let pvSettings = {};
  let pvBudgets = [
    { id: 1, category_group: null, monthly_amount: '3800.00' },
    { id: 2, category_group: 'Food & Dining', monthly_amount: '650.00' },
    { id: 3, category_group: 'Shopping', monthly_amount: '200.00' },
  ];
  let pvRules = [{ id: 1, name: null, match_type: 'contains', match_text: 'NETFLIX', category_group: 'Recurring & Subscriptions', category: 'Streaming', priority: 0, amount_direction: 'debit' }];
  app.get('/api/v1/spending-settings', (_req, res) => res.json({ settings: ss.normaliseSettings(pvSettings) }));
  app.patch('/api/v1/spending-settings', express.json(), (req, res) => {
    const v = ss.validateSettingsPatch(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    pvSettings = { ...pvSettings, ...v.patch };
    res.json({ settings: ss.normaliseSettings(pvSettings) });
  });
  app.get('/api/v1/budgets', (req, res) => {
    const b = previewEmpty(req) ? [] : pvBudgets.map(ss.toBudget);
    res.json({ budgets: b, total: ss.totalMonthlyBudget(b) });
  });
  app.put('/api/v1/budgets', express.json(), (req, res) => {
    const v = ss.validateBudgetInput(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    pvBudgets = pvBudgets.filter((b) => b.category_group !== v.budget.category_group).concat([{ id: Date.now(), ...v.budget }]);
    res.json({ budget: ss.toBudget(pvBudgets[pvBudgets.length - 1]) });
  });
  app.delete('/api/v1/budgets', (_req, res) => { const n = pvBudgets.length; pvBudgets = []; res.json({ ok: true, deleted: n }); });
  app.get('/api/v1/transaction-categories', (_req, res) => res.json({ groups: TAXONOMY.map((t) => ({ group: t.group, categories: t.categories })) }));
  app.get('/api/v1/transaction-rules', (_req, res) => res.json({ rules: pvRules }));
  app.delete('/api/v1/transaction-rules/:id', (req, res) => { pvRules = pvRules.filter((r) => String(r.id) !== req.params.id); res.json({ ok: true }); });
}
app.get('/api/v1/transaction-categories', (_req, res) => res.json([]));
app.get('/api/v1/transaction-rules', (_req, res) => res.json([]));
app.get('/api/v1/radar-templates', (_req, res) => res.json([]));
app.get('/api/v1/radar-template-versions', (_req, res) => res.json([]));
app.get('/api/v1/research', (_req, res) => res.json([]));
app.get('/api/v1/referrals', (_req, res) => res.json({
  code: 'K7MQ2XRP', link: 'http://localhost:4173/r/K7MQ2XRP',
  signedUp: 4, paid: 2, towardsNext: 2, needed: 3, rewardStatus: null,
}));
// ?state=trial (default) | ended | member — preview each Plan & Usage state.
app.get('/api/v1/usage', (req, res) => res.json({
  ...(() => {
    const m = require('../lib/membership');
    const state = String(req.query.state || (req.headers.referer || '').split('state=')[1] || 'trial').split('&')[0];
    const offer = { firstYear: m.formatAud(m.MEMBERSHIP.firstYearCents), renewal: m.formatAud(m.MEMBERSHIP.yearCents), line: m.offerLine() };
    if (state === 'member') return { plan: 'member', basePlan: 'member', paid: true, paywalled: false, trial: null, offer };
    if (state === 'ended') return { plan: 'free', basePlan: 'free', paid: false, paywalled: true, trial: { active: false, endsAt: null, daysLeft: 0 }, offer };
    return { plan: 'member', basePlan: 'free', paid: false, paywalled: false, trial: { active: true, endsAt: null, daysLeft: 9 }, offer };
  })(),
  period: '2026-11', resetsOn: '2026-12-01',
  features: {
    advisor_messages: { used: 37, limit: null },
    research_runs: { used: 2, limit: 10 },
    ai_files: { used: 1, limit: 10 },
    active_radars: { used: 1, limit: 10 },
  },
}));

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
