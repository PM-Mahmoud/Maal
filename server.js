// server.js
// Application entry point. Wires middleware, mounts route groups, starts server.

const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const { buildLandingContext } = require('./lib/landing-context');
const { sessionStore } = require('./db/auth');

// ─── Process-level error handlers ─────────────────────────────────────────
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
process.on('uncaughtException', (err) => { console.error('Uncaught exception:', err); process.exit(1); });

const app = express();
const port = process.env.PORT || 3000;

// ─── Security headers (Helmet) ─────────────────────────────────────────────
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
    },
  },
  crossOriginEmbedderPolicy: false, // needed for Stripe iframes
}));

// Trust Render's reverse proxy so req.secure is correct (needed for secure cookies)
app.set('trust proxy', 1);

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

// ─── Middleware ────────────────────────────────────────────────────────────

// Skip JSON body parsing for /billing/webhook — Stripe needs the raw body
// for signature verification. The route itself uses express.raw() instead.
app.use((req, res, next) => {
  if (req.path === '/billing/webhook') return next();
  express.json({ limit: '50kb' })(req, res, next);
});
app.use((req, res, next) => {
  if (req.path === '/billing/webhook') return next();
  express.urlencoded({ extended: true })(req, res, next);
});

// Session — 30-day persistence, stored in Postgres
// Fail fast in production if no secret is configured — a hardcoded fallback
// would let anyone forge session cookies. Dev keeps a throwaway default.
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  console.error('FATAL: SESSION_SECRET is not set in production. Refusing to start.');
  process.exit(1);
}
// SECURITY: generate a random ephemeral secret if SESSION_SECRET is not set (dev only)
// Sessions won't persist across restarts without a fixed SECRET — set SESSION_SECRET in env.
const _sessionSecret = process.env.SESSION_SECRET || (() => {
  const s = require('crypto').randomBytes(32).toString('hex');
  console.warn('[WARN] SESSION_SECRET not set — using ephemeral secret. Sessions will not survive restarts. Set SESSION_SECRET env var.');
  return s;
})();
const sessionMiddleware = require('express-session')({
  store: sessionStore,
  secret: _sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
});
app.use(sessionMiddleware);

// Make session available in all templates
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

// ─── Views ─────────────────────────────────────────────────────────────────

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Layout engine — dashboard pages use dashboard-layout.ejs as wrapper
app.use(expressLayouts);

// ─── Health (no DB) ───────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  // Integration flags are booleans only — never expose key values.
  const pool = require('./db/pool');
  let dbOk = false;
  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch (e) {
    console.error('Health check DB error:', e.message);
  }
  if (!dbOk) {
    return res.status(503).json({ status: 'unhealthy', db: false });
  }
  res.json({
    status: 'healthy',
    db: true,
    integrations: {
      basiq: !!(process.env.BASIQ_API_KEY || '').trim(),
      advisor: !!((process.env.AZURE_OPENAI_API_KEY || process.env.GROQ_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY || '').trim()),
      azure: !!((process.env.AZURE_OPENAI_API_KEY || '').trim() && (process.env.AZURE_OPENAI_ENDPOINT || '').trim() && (process.env.AZURE_OPENAI_DEPLOYMENT || '').trim()),
      stripe: !!(process.env.STRIPE_SECRET_KEY || '').trim(),
      isaacus: !!(process.env.ISAACUS_API_KEY || '').trim(),
    },
  });
});

// ─── Radar cron sweep ──────────────────────────────────────────────────────
// Hit by an external scheduler (e.g. cron-job.org) on whatever cadence you
// like, e.g. hourly: GET /internal/radar/run?token=<RADAR_CRON_SECRET>.
// Evaluates every radar whose frequency interval has elapsed and emails/SMSes
// alerts. Protected by a shared secret; returns 403 if unset or mismatched.
app.get('/internal/radar/run', async (req, res) => {
  const secret = (process.env.RADAR_CRON_SECRET || '').trim();
  if (!secret || req.query.token !== secret) return res.status(403).json({ error: 'forbidden' });
  try {
    const { runDueRadars } = require('./services/radar');
    const result = await runDueRadars();
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('radar cron error:', e.message);
    res.status(500).json({ error: 'radar sweep failed' });
  }
});

// ─── Knowledge ingest trigger (one-time HTTP trigger, no shell needed) ─────
// POST /internal/ingest-knowledge?token=<INGEST_SECRET>
// Fires the RAG ingest pipeline in the background; returns immediately.
// Watch Render logs for progress. Protected by INGEST_SECRET env var.
app.get('/internal/ingest-knowledge', (req, res) => {
  const secret = (process.env.INGEST_SECRET || '').trim();
  if (!secret || req.query.token !== secret) return res.status(403).json({ error: 'forbidden' });
  // Respond immediately — ingest runs in background (takes several minutes)
  res.json({ ok: true, message: 'Ingest started — watch Render logs for progress' });
  // Fire-and-forget: run after response is flushed
  setImmediate(async () => {
    try {
      const { runIngest } = require('./scripts/ingest-knowledge');
      await runIngest({ verbose: true });
      console.log('[ingest] Knowledge base ingest completed successfully');
    } catch (e) {
      console.error('[ingest] Knowledge base ingest failed:', e.message);
    }
  });
});

// ─── Static assets ────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public'), { index: false }));
// Serve React SPA assets from /assets (Vite build output)
app.use('/assets', express.static(path.join(__dirname, 'public', 'app', 'assets')));

// ─── Route mounts ──────────────────────────────────────────────────────────

app.use(require('./routes/auth'));
app.use(require('./routes/oauth'));
app.use(require('./routes/admin'));
app.use(require('./routes/reset'));
app.use(require('./routes/feedback'));
app.use('/dashboard/roadmap', require('./routes/roadmap'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/billing', require('./routes/billing'));
app.use('/basiq', require('./routes/basiq'));
app.use('/onboarding', require('./routes/onboarding'));
app.use('/api/onboarding', require('./routes/onboarding'));
app.use('/score', require('./routes/score'));
app.use('/dashboard/tools', require('./routes/tools'));
app.use('/dashboard/portfolio', require('./routes/portfolio'));
app.use('/api/waitlist', require('./routes/waitlist'));

// Public pages
app.get('/pricing', (req, res) => {
  const { buildAnalyticsSnippet } = require('./lib/landing-context');
  res.render('pricing', { layout: false,
    analyticsSnippet: buildAnalyticsSnippet(process.env.POLSIA_ANALYTICS_SLUG || ''),
    user: req.session && req.session.userId ? { id: req.session.userId } : null,
  });
});

app.get('/waitlist', (req, res) => {
  const { buildAnalyticsSnippet } = require('./lib/landing-context');
  res.render('waitlist', { layout: false,
    analyticsSnippet: buildAnalyticsSnippet(process.env.POLSIA_ANALYTICS_SLUG || ''),
    user: req.session && req.session.userId ? { id: req.session.userId } : null,
  });
});

app.get('/about', (req, res) => {
  const { buildAnalyticsSnippet } = require('./lib/landing-context');
  res.render('about', { layout: false,
    analyticsSnippet: buildAnalyticsSnippet(process.env.POLSIA_ANALYTICS_SLUG || ''),
    user: req.session && req.session.userId ? { id: req.session.userId } : null,
  });
});

app.get('/security', (req, res) => {
  const { buildAnalyticsSnippet } = require('./lib/landing-context');
  res.render('security', { layout: false,
    analyticsSnippet: buildAnalyticsSnippet(process.env.POLSIA_ANALYTICS_SLUG || ''),
    user: req.session && req.session.userId ? { id: req.session.userId } : null,
  });
});

app.get('/financial-wellbeing-score', (req, res) => {
  const { buildAnalyticsSnippet } = require('./lib/landing-context');
  res.render('financial-wellbeing-score', { layout: false,
    analyticsSnippet: buildAnalyticsSnippet(process.env.POLSIA_ANALYTICS_SLUG || ''),
    user: req.session && req.session.userId ? { id: req.session.userId } : null,
  });
});

app.get('/contact', (req, res) => {
  const { buildAnalyticsSnippet } = require('./lib/landing-context');
  res.render('contact', { layout: false,
    analyticsSnippet: buildAnalyticsSnippet(process.env.POLSIA_ANALYTICS_SLUG || ''),
    user: req.session && req.session.userId ? { id: req.session.userId } : null,
    success: false, name: '', email: '', message: '',
  });
});

app.post('/contact', async (req, res) => {
  const { buildAnalyticsSnippet } = require('./lib/landing-context');
  const { addFeedback } = require('./db/feedback');
  const { name, email, message } = req.body;
  const renderArgs = { layout: false,
    analyticsSnippet: buildAnalyticsSnippet(process.env.POLSIA_ANALYTICS_SLUG || ''),
    user: req.session && req.session.userId ? { id: req.session.userId } : null,
    success: false, name: name || '', email: email || '', message: message || '',
  };
  if (!name || !email || !message) {
    return res.render('contact', renderArgs);
  }
  try {
    const userId = req.session && req.session.userId ? req.session.userId : null;
    await addFeedback(userId, `Name: ${name}\nEmail: ${email}\n\n${message}`, 'contact');
    res.render('contact', { ...renderArgs, success: true, name: '', email: '', message: '' });
  } catch (err) {
    console.error('[contact] Failed to save message:', err.message);
    res.render('contact', renderArgs);
  }
});

// ─── JSON API for React SPA ──────────────────────────────────────────────
app.use('/api', require('./routes/api'));

// ─── Server-side gate for the React app shell ─────────────────────────────
// The authenticated React dashboard lives at /app/*. Its route guard is
// client-side only, so without this the SPA shell was served 200 to anyone
// (data is still protected server-side by /api/v1 user_id scoping, but the shell
// shouldn't render for logged-out users). Redirect unauthenticated /app/* to the
// login — same target as the client guard (_authenticated/route.tsx → /auth),
// which sends the user on to /app after sign-in. Authenticated requests fall
// through to the SPA catch-all below.
app.get(/^\/app(\/.*)?$/, (req, res, next) => {
  if (!req.session.userId) return res.redirect('/auth');
  next();
});

// ─── React SPA catch-all ──────────────────────────────────────────────────
// Serve React app for all routes not already handled by Express
const reactBuild = path.join(__dirname, 'public', 'app', 'index.html');
const fs = require('fs');
app.use('*', (req, res, next) => {
  // Skip API, dashboard (EJS), billing, basiq, score, onboarding, admin paths
  const skip = ['/api/', '/dashboard', '/billing', '/basiq', '/onboarding', '/score', '/login', '/signup', '/logout', '/forgot-password', '/reset-password', '/verify-email', '/admin', '/health', '/feedback', '/internal'];
  if (skip.some(p => req.originalUrl.startsWith(p))) return next();
  if (fs.existsSync(reactBuild)) {
    return res.sendFile(reactBuild);
  }
  // Fallback: render EJS landing if no React build
  res.render('layout', { layout: false, ...buildLandingContext() });
});

// ─── Start ─────────────────────────────────────────────────────────────────

// ─── Global error handler ─────────────────────────────────────────────────
// Must be registered after all routes. Catches any error passed to next(err)
// or thrown in a synchronous route handler.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).render('error', { layout: false, message: 'Something went wrong. Please try again.' });
});

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// ─── Graceful shutdown on SIGTERM (Render redeploys) ──────────────────────
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  const pool = require('./db/pool');
  server.close(() => {
    pool.end(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000);
});