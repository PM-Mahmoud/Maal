// routes/oauth.js — Google OAuth via raw redirect (no passport dependency)
// Uses Google's OAuth 2.0 endpoint directly to avoid extra packages.

const express = require('express');
const router = express.Router();
const https = require('https');
const { createUser, findUserByEmail, findUserByProvider, recordLogin } = require('../db/users');

function getIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function googleAuthUrl(state) {
  const base = process.env.BASE_URL || 'https://hellomaal.com';
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${base}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code) {
  const base = process.env.BASE_URL || 'https://hellomaal.com';
  const payload = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: `${base}/auth/google/callback`,
    grant_type: 'authorization_code',
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function getGoogleProfile(accessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.googleapis.com',
      path: '/oauth2/v3/userinfo',
      headers: { Authorization: `Bearer ${accessToken}` },
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── GET /auth/google — kick off OAuth ────────────────────────────────────────

router.get('/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.redirect('/login?error=google_not_configured');
  }
  const state = require('crypto').randomBytes(16).toString('hex');
  req.session.oauthState = state;
  req.session.save(() => res.redirect(googleAuthUrl(state)));
});

// ─── GET /auth/google/callback ────────────────────────────────────────────────

router.get('/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error || !code) return res.redirect('/login?error=google_denied');
  if (state !== req.session.oauthState) return res.redirect('/login?error=invalid_state');

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.access_token) return res.redirect('/login?error=google_token_failed');

    const profile = await getGoogleProfile(tokens.access_token);
    if (!profile.email) return res.redirect('/login?error=no_email');

    // Find or create user
    let user = await findUserByProvider('google', profile.sub);
    if (!user) {
      user = await findUserByEmail(profile.email);
      if (user) {
        // SECURITY: Do NOT auto-link -- an attacker who controls a Google account
        // with a matching email could silently take over an existing password account.
        // Instead, store the Google profile in session and redirect to a consent page
        // where the user must first sign in with their existing password.
        req.session.pendingGoogleLink = {
          googleId: profile.sub,
          email: profile.email,
          name: profile.displayName || profile.name,
        };
        await new Promise((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));
        return res.redirect('/auth/google/link-required');
      } else {
        // Brand new user via Google
        user = await createUser({
          email: profile.email,
          name: profile.name || profile.email,
          provider: 'google',
          providerId: profile.sub,
        });
        // Mark email verified immediately for OAuth users
        await require('../db/auth').pool.query(
          `UPDATE users SET email_verified = true WHERE id = $1`, [user.id]
        );
      }
    }

    await recordLogin(user.id, getIp(req));

    req.session.oauthState = null;
    req.session.userId = user.id;
    req.session.email = user.email || profile.email;
    req.session.name = user.name || profile.name;
    req.session.provider = 'google';
    req.session.emailVerified = true;
    req.session.save((err) => {
      if (err) console.error('[oauth] Session save error:', err.message);
      res.redirect('/dashboard');
    });
  } catch (err) {
    console.error('[oauth] Google callback error:', err.message);
    res.redirect('/login?error=google_failed');
  }
});

// --- GET /auth/google/link-required -------------------------------------------
// Shown when a Google login matches an existing email/password account.
// The user must sign in with their password to confirm the link.

router.get('/auth/google/link-required', (req, res) => {
  if (!req.session.pendingGoogleLink) return res.redirect('/login');
  res.render('auth-google-link', {
    email: req.session.pendingGoogleLink.email,
    layout: 'layout',
  });
});

module.exports = router;
