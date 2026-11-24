// scripts/preview-static.js
// Serves key pages rendered with mock locals (no database) so the design
// can be reviewed in a browser. Run: node scripts/preview-static.js
// Pages: / (landing), /login, /signup, public pages — plus a mock API layer
// so the React dashboard (/app) renders without a database.
//
// NOTE: The legacy EJS /dashboard/* is retired (server.js 301-redirects it to
// the React app at /app/*). This preview no longer renders those dead views —
// the real dashboard lives in the React app (client/src, served at /app).

const { safeError } = require('../lib/safe-log');
const express = require('express');
const ejs = require('ejs');
const path = require('path');

const VIEWS = path.join(__dirname, '..', 'views');
const app = express();
const port = Number(process.env.PORT || 4173);
const host = process.env.MAAL_PREVIEW_HOST;

// Same static mounts as server.js (lib/static-assets.js): /assets/* for the
// React build, /js/collapsing-mark.mjs, and plain 404s for missing files.
require('../lib/static-assets').mountStatic(app, path.join(__dirname, '..', 'public'));

// Set PREVIEW_USAGE_LIMIT=1 or open a preview page with ?usage_limit=1
// to exercise the billing prompts with deterministic 402 responses.
const previewLimits = {
  'POST /api/v1/advisor/message': 'advisor_messages',
  'POST /api/v1/advisor/stream': 'advisor_messages',
  'POST /api/v1/research/generate': 'research_runs',
  'POST /api/v1/alerts': 'active_radars',
  'POST /api/v1/alerts/toggle': 'active_radars',
  'POST /api/v1/files/generate': 'ai_files',
  'GET /api/v1/budgets/suggestion': 'advisor_messages',
};
const { upgradeMessage } = require('../lib/plan-limits');
function previewUsageLimit(req) {
  const referer = new URL(req.get('Referer') || '/', 'http://localhost');
  return process.env.PREVIEW_USAGE_LIMIT === '1' || req.query.usage_limit === '1' || referer.searchParams.get('usage_limit') === '1';
}
app.use((req, res, next) => {
  const feature = previewLimits[`${req.method} ${req.path}`];
  if (!feature || !previewUsageLimit(req)) return next();
  if (req.path === '/api/v1/alerts/toggle') {
    return express.json()(req, res, err => {
      if (err) return next(err);
      if (!(req.body?.data ?? req.body)?.active) return next();
      sendPreviewUsageLimit(res, feature);
    });
  }
  sendPreviewUsageLimit(res, feature);
});
function sendPreviewUsageLimit(res, feature) {
  res.status(402).json({
    code: 'usage_limit',
    error: upgradeMessage('member', feature),
    feature,
    upgrade: true,
    upgradeUrl: '/app/billing',
  });
}

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
    error: s === 'error' ? 'Email or password is incorrect' : null,
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
// Synthetic confirmation, success and expired-link states for HEL-79.
app.get('/unlock-account', (req, res, next) => {
  const success = req.query.state === 'success';
  const error = req.query.state === 'expired' ? 'This unlock link is invalid or has expired. Try signing in again.' : null;
  ejs.renderFile(path.join(VIEWS, 'auth-unlock-account.ejs'), {
    success, error, token: success || error ? '' : 'a'.repeat(64),
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

// Local-only fixtures for the checked-in app routes. Never call a provider.
app.get('/billing/offer', (_req, res) => res.json(require('../routes/billing').offerSummary()));
app.get('/basiq/institutions', (_req, res) => {
  const catalogue = require('../services/basiq-institutions');
  res.json({ live: false, source: 'static', popular: catalogue.pickPopular(catalogue.STATIC_INSTITUTIONS), institutions: catalogue.STATIC_INSTITUTIONS });
});
app.get('/lunchflow/status', (_req, res) => res.json({
  live: false, connected: false, scopes: [], scopes_confirmed: false,
}));
app.get('/api/v1/planning', (_req, res) => res.json(
  require('../lib/planning').buildPlanningSummary({ cash: 21000, monthlyEssentialExpenses: 3200 })
));
app.get('/api/v1/planning/history', (_req, res) => res.json([]));
app.get('/api/v1/wealth-summary', (_req, res) => {
  const { wealthTotalsFromSummary } = require('../db/assets');
  const components = {
    cashTotal: 21000, investmentsTotal: 20600, superTotal: 68500,
    propertyTotal: 0, propertyMortgageTotal: 0, debtsTotal: 34600, otherAssetsTotal: 0,
  };
  res.json({ ...wealthTotalsFromSummary(components), components });
});


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

// HEL-38 preview-only account history for Home's account filter.
app.post('/api/v1/snapshots/accounts', express.json(), (req, res) => {
  const sample = {
    'cash:c1': 18600, 'cash:c2': 2400, 'investment:inv1': 12400, 'investment:inv2': 8200,
    'super:s1': 68500, 'debt:d1': -23400, 'debt:d2': -11200,
  };
  const keys = (req.body?.account_keys || []).filter((key) => Object.hasOwn(sample, key));
  if (!keys.length) return res.json([]);
  const today = keys.reduce((sum, key) => sum + sample[key], 0);
  return res.json([4, 3, 2, 1, 0].map((day) => ({ date: iso(day).slice(0, 10), value: today - day * keys.length * 10 })));
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
    const petCare = app.locals.previewPetCareName?.();
    if (petCare && k === 0) add(at(1), 'Pet supplies', -42, petCare, null);
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
// ── Session 2 – Breakdown & budget preview (HEL-84..90) ─────────────────────
// In-memory custom categories + groups and the budget suggestion, mirroring
// routes/api.js "Session 2 – Breakdown & budget". Registered before the other
// Spending mocks so GET /api/v1/transaction-categories includes custom ones.
{
  const sc = require('../lib/spending-categories');
  let pvSeq = 3;
  let pvCustom = [{ id: '1', name: 'Pet care', kind: 'expense', color: '#3E7C6B', icon: 'paw' }];
  let pvGroups = [{ id: '2', name: 'Fun', kind: 'expense', color: '#4E6E94', categories: ['Shopping', 'Travel & Lifestyle', 'Pet care'] }];
  const names = () => pvCustom.map((c) => c.name);
  app.locals.pvCustomNames = names;
  app.locals.previewPetCareName = () => pvCustom.find((category) => category.id === '1')?.name;
  app.get('/api/v1/spending-categories', (req, res) => res.json(previewEmpty(req) ? { categories: [], groups: [] } : { categories: pvCustom, groups: pvGroups }));
  app.post('/api/v1/spending-categories', express.json(), (req, res) => {
    const v = sc.validateCategoryInput(req.body, names());
    if (v.error) return res.status(400).json({ error: v.error });
    const c = { id: String(++pvSeq), ...v.category };
    pvCustom = pvCustom.concat([c]);
    res.json({ category: c });
  });
  // HEL-113 — mirror category edits and reassign the existing group's members
  // and budget rows so the rename is visible across Spending previews.
  app.patch('/api/v1/spending-categories/:id', express.json(), (req, res) => {
    const current = pvCustom.find((category) => category.id === req.params.id);
    if (!current) return res.status(404).json({ error: 'Category not found' });
    const result = sc.validateCategoryInput(req.body, names(), { partial: true, currentName: current.name });
    if (result.error) return res.status(400).json({ error: result.error });
    const category = { ...current, ...result.category };
    pvCustom = pvCustom.map((item) => item.id === current.id ? category : item);
    if (category.name !== current.name) {
      pvGroups = pvGroups.map((group) => ({
        ...group,
        categories: group.categories.map((name) => name === current.name ? category.name : name),
      }));
      app.locals.previewRenameCategoryBudget?.(current.name, category.name);
    }
    res.json({ category });
  });
  app.delete('/api/v1/spending-categories/:id', (req, res) => {
    const c = pvCustom.find((x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Category not found' });
    pvCustom = pvCustom.filter((x) => x !== c);
    pvGroups = pvGroups.map((g) => ({ ...g, categories: g.categories.filter((n) => n !== c.name) }));
    app.locals.previewRenameCategoryBudget?.(c.name);
    res.json({ ok: true });
  });
  const known = () => [...require('../lib/transaction-categories').GROUPS, ...names()];
  app.post('/api/v1/spending-category-groups', express.json(), (req, res) => {
    const v = sc.validateGroupInput(req.body, known(), pvGroups.map((g) => g.name));
    if (v.error) return res.status(400).json({ error: v.error });
    pvGroups = pvGroups.map((g) => ({ ...g, categories: g.categories.filter((n) => !v.group.categories.includes(n)) }));
    const g = { id: String(++pvSeq), ...v.group };
    pvGroups = pvGroups.concat([g]);
    res.json({ group: g });
  });
  app.patch('/api/v1/spending-category-groups/:id', express.json(), (req, res) => {
    const cur = pvGroups.find((g) => g.id === req.params.id);
    if (!cur) return res.status(404).json({ error: 'Group not found' });
    const v = sc.validateGroupInput(req.body, known(), pvGroups.map((g) => g.name), { partial: true, currentName: cur.name });
    if (v.error) return res.status(400).json({ error: v.error });
    pvGroups = pvGroups.map((g) => (g === cur ? { ...g, ...v.group } : v.group.categories ? { ...g, categories: g.categories.filter((n) => !v.group.categories.includes(n)) } : g));
    res.json({ group: pvGroups.find((g) => g.id === cur.id) });
  });
  app.delete('/api/v1/spending-category-groups/:id', (req, res) => {
    pvGroups = pvGroups.filter((g) => g.id !== req.params.id);
    res.json({ ok: true });
  });
  app.get('/api/v1/transaction-categories', (_req, res) => res.json({ groups: sc.mergeTaxonomy(pvCustom) }));
  // ?ai=thin on the page URL previews the "not enough history" state.
  app.get('/api/v1/budgets/suggestion', async (req, res) => {
    const { suggestBudget } = await import('../shared/spending-breakdown.mjs');
    const thin = previewEmpty(req) || /ai=thin/.test(req.headers.referer || '');
    const suggestion = suggestBudget(thin ? [] : previewTransactions(), new Date());
    res.json({ suggestion, wording: null, wording_status: suggestion.enoughData ? 'unavailable' : 'skipped' });
  });
}
// ── end Session 2 – Breakdown & budget preview ──────────────────────────────
// ── Session 2 – Transactions list (HEL-91..95) preview mocks ─────────────────
// Only active on /app/transactions (by referer) so other pages' previews are
// unchanged. Adds account references (CommBank / ING, cafés as manual entries),
// keeps rows added via "Add transaction" in memory, honours category changes,
// and names the accounts via cash_accounts. ?tx=flags on the page URL also adds
// the optional hidden / reviewed flags so those filters can be previewed.
// The page reads GET /api/v1/reports/transactions?from&to (validated like the
// real endpoint, ≤ 3 years); ?tx=truncated previews the row cap (newest 100 kept).
{
  const onTxPage = (req) => /\/app\/transactions/.test(req.headers.referer || '');
  const txFlags = (req) => /tx=flags/.test(req.headers.referer || '');
  const txAdded = [];
  // HEL-114 — preview-owned cash accounts include one account without a bank feed.
  const txAccounts = [
    { id: '101', label: 'Savings Maximiser', institution: 'ING', account_reference: 'basiq:ing-0412', balance: 18600 },
    { id: '102', label: 'Everyday Smart Access', institution: 'CommBank', account_reference: 'basiq:cba-7781', balance: 2400 },
    { id: '103', label: 'Cash wallet', institution: null, account_reference: null, balance: 75 },
  ];
  app.locals.previewAddedTransaction = (id) => txAdded.find((row) => String(row.id) === id);
  const txCats = new Map();
  const txAccount = (t) => {
    if (t.category === 'Cafes') return null; // manual entries
    if (t.category_group === 'Income' || t.description.startsWith('Transfer to savings')) return 'basiq:ing-0412';
    return 'basiq:cba-7781';
  };
  const txRows = (req) => [...txAdded, ...previewTransactions().map((t, i) => ({
    ...t,
    account_reference: txAccount(t),
    category_source: 'manual',
    ...(txFlags(req) ? { hidden: t.relationship_type === 'transfer', reviewed: i % 4 === 0 } : {}),
  }))].map((t) => (txCats.has(String(t.id)) ? { ...t, ...txCats.get(String(t.id)), category_source: 'manual' } : t));
  app.get('/api/v1/transactions', (req, res, next) => {
    if (!onTxPage(req)) return next();
    if (previewEmpty(req)) return res.json([]);
    res.json(txRows(req).sort((a, b) => String(b.post_date).localeCompare(String(a.post_date))));
  });
  app.get('/api/v1/reports/transactions', (req, res, next) => {
    if (!onTxPage(req)) return next();
    const v = require('../lib/report-views').validateRange(req.query.from, req.query.to);
    if (v.error) return res.status(400).json({ error: v.error });
    let rows = previewEmpty(req) ? [] : txRows(req)
      .filter((t) => String(t.post_date).slice(0, 10) >= v.from && String(t.post_date).slice(0, 10) <= v.to)
      .sort((a, b) => String(a.post_date).localeCompare(String(b.post_date)));
    // Like db/reports.js at its cap: keep the newest rows, drop the oldest (cap of 100 here).
    const truncated = /tx=truncated/.test(req.headers.referer || '') && rows.length > 100;
    if (truncated) rows = rows.slice(-100);
    res.json({ from: v.from, to: v.to, transactions: rows, truncated });
  });
  app.post('/api/v1/transactions', express.json(), (req, res) => {
    const d = (req.body && req.body.data) || req.body || {};
    if (!d.description || !Number.isFinite(Number(d.amount)) || !d.occurred_on) return res.status(400).json({ error: 'Transaction description is required' });
    let accountId;
    try { accountId = require('../lib/transaction-import').normalizeManualCashAccountId(d.cash_account_id); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const account = accountId ? txAccounts.find((item) => item.id === accountId) : null;
    if (accountId && !account) return res.status(404).json({ error: 'Cash account not found.' });
    const row = {
      id: 9000 + txAdded.length, description: String(d.description), amount: Number(d.amount), post_date: d.occurred_on,
      account_reference: account ? account.account_reference || `cash:${account.id}` : null,
      institution_name: account?.institution ?? null,
      manual_account_label: account?.label ?? null,
    };
    txAdded.unshift(row);
    res.json(row);
  });
  app.patch('/api/v1/transactions/:id/category', express.json(), (req, res) => {
    txCats.set(String(req.params.id), { category_group: req.body.category_group, category: req.body.category || null });
    res.json({ ok: true });
  });
  app.get('/api/v1/cash_accounts', (req, res, next) => {
    if (!onTxPage(req)) return next();
    res.json(txAccounts);
  });
}
// ── end Session 2 – Transactions list ────────────────────────────────────────
// ── Session 2 – Transaction detail preview (HEL-96..103) ──────────────────
// In-memory meta / tags / splits mirroring routes/api.js "Session 2 –
// Transaction detail" shapes. Registered before GET /api/v1/transactions so the
// list carries the additive hidden / reviewed / tags / splits fields too.
{
  const td = require('../lib/transaction-detail');
  const { isKnownGroup, isValidCategory } = require('../lib/transaction-categories');
  const pvMeta = new Map(); // id -> { hidden, reviewed, note, merchant_name, description }
  const pvTxnTags = new Map(); // id -> [tagId]
  const pvSplits = new Map(); // id -> [split]
  const pvCats = new Map(); // id -> { category_group, category } (manual overrides)
  let pvTags = [
    { id: '1', name: 'Work trip', color: 'sky' },
    { id: '2', name: 'Tax deductible', color: 'sage' },
  ];
  let pvTagSeq = 3;
  pvTxnTags.set('t4', ['2']);
  const decorate = (t) => {
    const m = pvMeta.get(t.id) || {};
    const cat = pvCats.get(t.id);
    const out = {
      ...t,
      ...(cat ? { ...cat, category_source: 'manual' } : { category_source: 'auto' }),
      hidden: !!m.hidden, reviewed: !!m.reviewed, reviewed_at: m.reviewed ? new Date().toISOString() : null,
      note: m.note || null, merchant_name: m.merchant_name || null, description_override: m.description || null,
      tags: (pvTxnTags.get(t.id) || []).map((id) => pvTags.find((g) => g.id === id)).filter(Boolean),
      splits: pvSplits.get(t.id) || [],
      account_reference: t.account_reference === undefined ? '06-2000-12345678' : t.account_reference,
      institution_name: t.institution_name === undefined ? 'Commonwealth Bank' : t.institution_name,
    };
    if (m.merchant_name) out.merchant = m.merchant_name;
    return out;
  };
  const find = (id) => app.locals.previewAddedTransaction?.(id) || previewTransactions().find((t) => t.id === id);
  app.locals.previewDecorate = decorate; // reused by the Reports preview block
  app.get('/api/v1/transactions', (req, res) => res.json(previewEmpty(req) ? [] : previewTransactions().map(decorate)));
  app.get('/api/v1/transactions/:id/detail', (req, res) => {
    const t = find(req.params.id);
    if (!t) return res.status(404).json({ error: 'Transaction not found.' });
    res.json({ transaction: decorate(t) });
  });
  app.patch('/api/v1/transactions/:id/meta', express.json(), (req, res) => {
    if (!find(req.params.id)) return res.status(404).json({ error: 'Transaction not found.' });
    const v = td.validateMetaPatch(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    pvMeta.set(req.params.id, { ...(pvMeta.get(req.params.id) || {}), ...v.patch });
    res.json({ ok: true });
  });
  app.patch('/api/v1/transactions/:id/category', express.json(), (req, res) => {
    const d = req.body || {};
    if (!isKnownGroup(d.category_group) || !isValidCategory(d.category_group, d.category)) return res.status(400).json({ error: 'Unknown category.' });
    pvCats.set(req.params.id, { category_group: d.category_group, category: d.category || null });
    res.json({ ok: true });
  });
  app.put('/api/v1/transactions/:id/tags', express.json(), (req, res) => {
    const v = td.validateTagIds(req.body && req.body.tag_ids);
    if (v.error) return res.status(400).json({ error: v.error });
    pvTxnTags.set(req.params.id, v.ids.filter((id) => pvTags.some((g) => g.id === id)));
    res.json({ ok: true });
  });
  app.put('/api/v1/transactions/:id/splits', express.json(), async (req, res) => {
    const t = find(req.params.id);
    if (!t) return res.status(404).json({ error: 'Transaction not found.' });
    const { validateSplits } = await import('../shared/transaction-splits.mjs');
    const v = validateSplits(t.amount, req.body && req.body.splits);
    if (!v.ok) return res.status(400).json({ error: v.error, partErrors: v.partErrors });
    pvSplits.set(t.id, v.parts.map((p, i) => ({ id: `${t.id}-${i + 1}`, position: i + 1, ...p })));
    res.json({ splits: pvSplits.get(t.id) });
  });
  app.delete('/api/v1/transactions/:id/splits', (req, res) => { pvSplits.delete(req.params.id); res.json({ ok: true }); });
  app.post('/api/v1/transactions/bulk-edit', express.json(), (req, res) => {
    // Preview ids look like "t12"; the real API takes numeric ids.
    const body = { ...req.body, ids: (req.body && Array.isArray(req.body.ids) ? req.body.ids : []).map((x) => String(x).replace(/^t/, '')) };
    const v = td.validateBulkEdit(body);
    if (v.error) return res.status(400).json({ error: v.error });
    const ids = v.ids.map((id) => `t${id}`).filter((id) => find(id));
    for (const id of ids) {
      const c = v.changes;
      if (c.category === null) pvCats.delete(id);
      else if (c.category) pvCats.set(id, c.category);
      const m = { ...(pvMeta.get(id) || {}) };
      for (const k of ['hidden', 'reviewed', 'merchant_name', 'description']) if (c[k] !== undefined) m[k] = c[k];
      pvMeta.set(id, m);
      if (c.set_tag_ids) pvTxnTags.set(id, c.set_tag_ids);
      if (c.add_tag_ids) pvTxnTags.set(id, [...new Set([...(pvTxnTags.get(id) || []), ...c.add_tag_ids])]);
    }
    if (!ids.length) return res.status(404).json({ error: 'Transaction not found.' });
    res.json({ updated: ids.length });
  });
  // HEL-112 — mock tag management in the Spending settings and detail dialogs.
  const countTagUses = (id) => [...pvTxnTags.values()].filter((ids) => ids.includes(id)).length;
  const withUses = (tag) => ({ ...tag, uses: countTagUses(tag.id) });
  // ?tags=empty on the page URL previews the "no tags yet" state.
  app.get('/api/v1/tags', (req, res) => res.json({
    tags: /tags=empty/.test(req.headers.referer || '') ? [] : pvTags.map(withUses), colors: td.TAG_COLORS,
  }));
  app.post('/api/v1/tags', express.json(), (req, res) => {
    const v = td.validateTag(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    if (pvTags.some((g) => g.name.toLowerCase() === v.tag.name.toLowerCase())) return res.status(409).json({ error: 'You already have a tag with that name.' });
    const tag = { id: String(pvTagSeq++), ...v.tag };
    pvTags = [...pvTags, tag];
    res.json({ tag: withUses(tag) });
  });
  app.patch('/api/v1/tags/:id', express.json(), (req, res) => {
    const tag = pvTags.find((g) => g.id === req.params.id);
    if (!tag) return res.status(404).json({ error: 'Tag not found.' });
    const result = td.validateTagPatch(req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    if (result.patch.name && pvTags.some((g) => g.id !== tag.id && g.name.toLowerCase() === result.patch.name.toLowerCase())) {
      return res.status(409).json({ error: 'You already have a tag with that name.' });
    }
    Object.assign(tag, result.patch);
    res.json({ tag: withUses(tag) });
  });
  app.delete('/api/v1/tags/:id', (req, res) => {
    const id = req.params.id;
    if (!pvTags.some((g) => g.id === id)) return res.status(404).json({ error: 'Tag not found.' });
    pvTags = pvTags.filter((g) => g.id !== id);
    for (const [txn, ids] of pvTxnTags) pvTxnTags.set(txn, ids.filter((tagId) => tagId !== id));
    res.json({ ok: true });
  });
}
// ── end Session 2 – Transaction detail preview ─────────────────────────────
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
app.get('/api/v1/alerts', (req, res) => res.json({
  alerts: [
    { id: 'a1', name: 'BHP price watch', prompt: 'Alert me if BHP drops more than 5% in a week', active: true, last_status: 'OK' },
    ...(previewUsageLimit(req) ? [{ id: 'a2', name: 'Paused radar', prompt: 'Watch for an RBA rate decision', active: false, last_status: 'OK' }] : []),
  ],
  events: [],
}));
app.get('/api/v1/notifications', (_req, res) => res.json([]));
app.get('/api/v1/notification-prefs', (_req, res) => res.json({}));
app.get('/api/v1/advisor/memory', (_req, res) => res.json({ memory: null, customInstructions: null }));
// ?banks=live on the page URL previews the live Basiq connect step.
// HEL-117 — a completed mock run for the Transactions bank sync notice.
app.get('/api/v1/import-runs/:id', (req, res) => {
  if (req.params.id !== '1') return res.status(404).json({ error: 'Import run not found' });
  res.json({ import_run: { id: '1', status: 'succeeded' } });
});
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
    { id: 4, category_group: 'Pet care', monthly_amount: '80.00' },
  ];
  let pvRules = [{ id: 1, name: null, match_type: 'contains', match_text: 'NETFLIX', category_group: 'Recurring & Subscriptions', category: 'Streaming', priority: 0, amount_direction: 'debit' }];
  app.locals.previewRenameCategoryBudget = (from, to) => {
    pvBudgets = pvBudgets.flatMap((budget) => {
      if (budget.category_group !== from) return [budget];
      return to === undefined ? [] : [{ ...budget, category_group: to }];
    });
  };
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
    const v = ss.validateBudgetInput(req.body, app.locals.pvCustomNames ? app.locals.pvCustomNames() : []);
    if (v.error) return res.status(400).json({ error: v.error });
    pvBudgets = pvBudgets.filter((b) => b.category_group !== v.budget.category_group).concat([{ id: Date.now(), ...v.budget }]);
    res.json({ budget: ss.toBudget(pvBudgets[pvBudgets.length - 1]) });
  });
  app.delete('/api/v1/budgets/:id', (req, res) => { pvBudgets = pvBudgets.filter((b) => String(b.id) !== req.params.id); res.json({ ok: true }); });
  app.delete('/api/v1/budgets', (_req, res) => { const n = pvBudgets.length; pvBudgets = []; res.json({ ok: true, deleted: n }); });
  app.get('/api/v1/transaction-categories', (_req, res) => res.json({ groups: TAXONOMY.map((t) => ({ group: t.group, categories: t.categories })) }));
  app.get('/api/v1/transaction-rules', (_req, res) => res.json({ rules: pvRules }));
  app.delete('/api/v1/transaction-rules/:id', (req, res) => { pvRules = pvRules.filter((r) => String(r.id) !== req.params.id); res.json({ ok: true }); });
}
// ── Session 2 – Reports preview (HEL-106/HEL-107) ──────────────────────────
// Mirrors the "Session 2 – Reports" block in routes/api.js: the date-ranged
// transactions read (same deterministic rows as /api/v1/transactions) and
// in-memory saved views validated by lib/report-views.js.
// ?spend=empty on the page URL previews the no-data state; ?reports=fail
// previews the failed-request state.
{
  const rv = require('../lib/report-views');
  let pvViews = [];
  let pvViewSeq = 1;
  const failing = (req) => /reports=fail/.test(req.headers.referer || '');
  app.get('/api/v1/reports/transactions', (req, res) => {
    if (failing(req)) return res.status(500).json({ error: 'Could not load transactions for this report' });
    const v = rv.validateRange(req.query.from, req.query.to);
    if (v.error) return res.status(400).json({ error: v.error });
    const decorate = app.locals.previewDecorate || ((t) => t);
    const rows = previewEmpty(req) ? [] : previewTransactions()
      .filter((t) => t.post_date >= v.from && t.post_date <= v.to)
      .map(decorate)
      .sort((a, b) => a.post_date.localeCompare(b.post_date));
    res.json({ from: v.from, to: v.to, transactions: rows, truncated: false });
  });
  app.get('/api/v1/report-views', (_req, res) => res.json({ views: pvViews.map(rv.toView) }));
  app.post('/api/v1/report-views', express.json(), (req, res) => {
    const v = rv.validateViewInput(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    if (pvViews.length >= rv.MAX_VIEWS) return res.status(400).json({ error: `You can save up to ${rv.MAX_VIEWS} reports. Delete one to save another.` });
    const now = new Date();
    const row = { id: pvViewSeq++, ...v.view, created_at: now, updated_at: now };
    pvViews.push(row);
    res.status(201).json({ view: rv.toView(row) });
  });
  app.patch('/api/v1/report-views/:id', express.json(), (req, res) => {
    const v = rv.validateViewPatch(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const row = pvViews.find((x) => String(x.id) === req.params.id);
    if (!row) return res.status(404).json({ error: 'Saved report not found' });
    Object.assign(row, v.patch, { updated_at: new Date() });
    res.json({ view: rv.toView(row) });
  });
  app.delete('/api/v1/report-views/:id', (req, res) => {
    const n = pvViews.length;
    pvViews = pvViews.filter((x) => String(x.id) !== req.params.id);
    if (pvViews.length === n) return res.status(404).json({ error: 'Saved report not found' });
    res.json({ ok: true });
  });
}
// ── end Session 2 – Reports preview ────────────────────────────────────────
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

// HEL-39: one local preview conversation for reviewing advisor reply feedback.
{
  const thread = { id: '1', title: 'How does super work?', updated_at: new Date().toISOString(), is_favourite: false };
  const messages = [
    { id: '1', role: 'user', content: 'How does super work?' },
    { id: '2', role: 'assistant', content: 'Super is money set aside for your retirement. Your employer generally contributes to your super fund as you earn.', rating: null },
  ];
  app.get('/api/v1/advisor/threads', (_req, res) => res.json({ threads: [thread] }));
  app.get('/api/v1/advisor/threads/1', (_req, res) => res.json({ thread, messages }));
  app.post('/api/v1/advisor/threads/1/messages', express.json(), (req, res) => {
    const inserted = req.body.messages.map((message, index) => ({
      id: String(messages.length + index + 1), role: message.role, content: message.content,
      ...message.meta,
    }));
    messages.push(...inserted);
    res.status(201).json({ thread, messageIds: inserted.map((message) => message.id) });
  });
  app.post('/api/v1/advisor/threads/1/messages/:messageId/feedback', express.json(), (req, res) => {
    const message = messages.find((row) => row.id === req.params.messageId && row.role === 'assistant');
    if (!message) return res.status(404).json({ error: 'Reply not found' });
    const { rating } = req.body;
    if (![null, 'up', 'down'].includes(rating)) return res.status(400).json({ error: 'Invalid rating' });
    message.rating = rating;
    res.json({ rating });
  });
}

// Mutations + advisor: canned successes so preview clicks never error
app.post('/api/auth/login', (_req, res) => res.json({ user: PREVIEW_USER }));
app.post('/api/auth/signup', (_req, res) => res.status(202).json({ next: '/verify-email' }));
app.post('/api/auth/logout', (_req, res) => res.json({ ok: true }));
// The static preview does not invoke the live advisor.
app.post('/api/v1/advisor/stream', (_req, res) => res.sendStatus(501));
app.post('/api/v1/advisor/message', (_req, res) => res.json({
  reply: 'This is the local design preview — once connected to the live backend, I answer questions about your real finances here.',
  widgets: [], followUps: [], citations: [],
}));
app.use('/api', (req, res) => {
  if (req.method === 'GET') return res.json([]);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error("[preview-static] Operation failed:", safeError(err));
  res.status(500).send('<pre>' + (err.stack || err.message) + '</pre>');
});

// React SPA — serve public/app/index.html for all unmatched routes (the real
// dashboard), with the same 404 rules as server.js (lib/app-routes.js).
const reactIndex = path.join(__dirname, '..', 'public', 'app', 'index.html');
const fs = require('fs');
const appRoutes = require('../lib/app-routes');
const routeManifest = appRoutes.loadRouteManifest(path.join(__dirname, '..', 'public', 'app', 'route-manifest.json'));
app.use('*', (req, res, next) => {
  const kind = appRoutes.classifyRequest(routeManifest, req.originalUrl);
  if (kind === 'asset') return res.status(404).type('text/plain').send('Not found');
  if (kind === 'public-404') {
    return ejs.renderFile(path.join(VIEWS, 'not-found.ejs'), { signedIn: req.query.signedin === '1' })
      .then((html) => res.status(404).send(html)).catch(next);
  }
  if (fs.existsSync(reactIndex)) {
    if (kind === 'spa-404') res.status(404);
    res.sendFile(reactIndex);
  } else {
    res.status(404).send('404 - React build not found. Run: cd client && npm run build');
  }
});

const server = app.listen(port, host, () => {
  console.log(`Preview on http://${host || 'localhost'}:${server.address().port}`);
});
