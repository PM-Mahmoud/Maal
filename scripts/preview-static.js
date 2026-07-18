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
