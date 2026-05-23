// server.js
// Application entry point. Wires middleware, mounts route groups, starts server.

const express = require('express');
const path = require('path');
const { buildLandingContext } = require('./lib/landing-context');
const { sessionStore } = require('./db/auth');

const app = express();
const port = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

// ─── Middleware ────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // parse HTML form POST bodies

// Session — 30-day persistence, stored in Postgres
const sessionMiddleware = require('express-session')({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'REDACTED',
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

// ─── Health (no DB) ───────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy' });
});

// ─── Static assets ────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ─── Route mounts ──────────────────────────────────────────────────────────

app.use(require('./routes/auth'));
app.use(require('./routes/reset'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/onboarding', require('./routes/onboarding'));
app.use('/api/onboarding', require('./routes/onboarding'));
app.use('/score', require('./routes/score'));
app.use('/dashboard/tools', require('./routes/tools'));
app.use('/dashboard/portfolio', require('./routes/portfolio'));

// Landing page must come AFTER auth routes (which redirect logged-in users)
app.get('/', (_req, res) => {
  res.render('layout', buildLandingContext());
});

// ─── Start ─────────────────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});