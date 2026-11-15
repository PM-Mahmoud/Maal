'use strict';
// Security headers and request guards for server.js, kept in one module so
// test/security-headers.test.js exercises the exact same configuration.
//
//  1. helmet(): the ENFORCED Content-Security-Policy (unchanged allowlist, plus
//     the Stripe Checkout form-action fix) and helmet's companion headers
//     (HSTS, nosniff, X-Frame-Options, Referrer-Policy, COOP, CORP, no
//     X-Powered-By).
//  2. Permissions-Policy: turn off powerful features the site never uses.
//  3. A strict, nonce-based CSP in REPORT-ONLY mode. It cannot block anything;
//     browsers report what it WOULD block to /csp-report. Once the reports are
//     quiet it can replace the enforced policy's 'unsafe-inline' script-src.
//     Templates put the per-request nonce on their <script> tags via
//     locals.cspNonce.
//  4. Fetch Metadata guard: reject state-changing requests (POST/PUT/PATCH/
//     DELETE) that a browser marks as cross-site. Backs up SameSite=Lax cookies
//     against CSRF. Server-to-server callers (Stripe webhook, cron) send no
//     Sec-Fetch-* headers and are unaffected.

const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');

const CSP_REPORT_PATH = '/csp-report';
const CSP_REPORT_GROUP = 'csp-endpoint';

// Enforced policy. helmet merges these over its defaults (base-uri 'self',
// object-src 'none', frame-ancestors 'self', script-src-attr 'none', …).
const ENFORCED_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://js.stripe.com'],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com'],
  imgSrc: ["'self'", 'data:', 'https:'],
  connectSrc: ["'self'", 'https://api.stripe.com'],
  frameSrc: ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com'],
  // "Subscribe" is a form POST to /billing/checkout that 303-redirects to Stripe
  // Checkout. Browsers apply form-action to that redirect too, so 'self' alone
  // can block the hand-off to Stripe.
  formAction: ["'self'", 'https://checkout.stripe.com'],
};

// Features no page uses. Microphone stays available to our own origin for
// voice input in Ask Maal (Web Speech API). Clipboard and Web Share (invite
// links) are allowed by default for same-origin and are not listed.
const PERMISSIONS_POLICY = [
  'camera=()',
  'geolocation=()',
  'microphone=(self)',
  'payment=()',
  'usb=()',
  'browsing-topics=()',
].join(', ');

function reportOnlyPolicy(nonce) {
  return [
    // 'strict-dynamic' lets nonced scripts load their own dependencies (Vite's
    // lazy route chunks). 'unsafe-inline' https: are ignored by browsers that
    // understand nonces; they only keep very old browsers working.
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'report-sample' 'unsafe-inline' https:`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
    `report-uri ${CSP_REPORT_PATH}`,
    `report-to ${CSP_REPORT_GROUP}`,
  ].join('; ');
}

function headerMiddleware(req, res, next) {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
  res.setHeader('Reporting-Endpoints', `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`);
  res.setHeader('Content-Security-Policy-Report-Only', reportOnlyPolicy(nonce));
  next();
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function fetchMetadataGuard(req, res, next) {
  res.vary('Sec-Fetch-Site');
  if (!UNSAFE_METHODS.has(req.method)) return next();
  // Absent header = not a modern browser (server-to-server webhook, cron,
  // curl, old browser). Same-origin, same-site and user-initiated ('none')
  // requests pass. Only a browser-declared cross-site write is refused.
  if (req.get('Sec-Fetch-Site') !== 'cross-site') return next();
  if (req.path === CSP_REPORT_PATH) return next();
  res.status(403).type('text/plain').send('Cross-site request blocked.');
}

// Keep only scheme://host/path of a reported URL: query strings can carry
// tokens or emails, and these lines end up in the host's logs.
function stripUrl(value) {
  if (typeof value !== 'string' || !value) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value.slice(0, 40); // 'inline', 'eval', …
  try {
    const u = new URL(value);
    return `${u.origin}${u.pathname}`.slice(0, 200);
  } catch {
    return '';
  }
}

function summariseReport(body) {
  // Legacy report-uri: { "csp-report": {...} }. Reporting API: [{ type, body }].
  const items = Array.isArray(body)
    ? body.filter((r) => r && r.type === 'csp-violation').map((r) => r.body || {})
    : body && body['csp-report'] ? [body['csp-report']] : [];
  return items.slice(0, 10).map((r) => ({
    directive: String(r.effectiveDirective || r['effective-directive'] || r['violated-directive'] || '').slice(0, 60),
    blocked: stripUrl(r.blockedURL || r['blocked-uri']),
    page: stripUrl(r.documentURL || r['document-uri']),
    sample: String(r.sample || r['script-sample'] || '').slice(0, 40),
  }));
}

function cspReportHandler(req, res) {
  for (const r of summariseReport(req.body)) {
    console.warn(`[csp-report] ${r.directive} blocked=${r.blocked} page=${r.page}${r.sample ? ` sample=${JSON.stringify(r.sample)}` : ''}`);
  }
  res.status(204).end();
}

// The React shell (public/app/index.html) is a static Vite build file: it holds
// no user data, so stamping the per-request nonce onto its own <script> tags is
// safe (this must never be done to HTML that contains user input). Read once
// and re-read only when the build file changes.
let shellCache = { mtimeMs: -1, html: '' };
function readShell(file) {
  const fs = require('fs');
  const { mtimeMs } = fs.statSync(file);
  if (mtimeMs !== shellCache.mtimeMs) shellCache = { mtimeMs, html: fs.readFileSync(file, 'utf8') };
  return shellCache.html;
}

function stampNonce(html, nonce) {
  return html.replace(/<script(?=[\s>])/g, `<script nonce="${nonce}"`);
}

function sendShell(res, file) {
  const html = stampNonce(readShell(file), res.locals.cspNonce || '');
  // The nonce makes every response unique, so no ETag; no-cache keeps the
  // shell fresh after deploys while still allowing the back/forward cache.
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(html);
}

function applySecurityHeaders(app, { reportLimiter } = {}) {
  app.use(helmet({
    contentSecurityPolicy: { directives: ENFORCED_DIRECTIVES },
    crossOriginEmbedderPolicy: false, // needed for Stripe iframes
  }));
  app.use(headerMiddleware);
  app.use(fetchMetadataGuard);
  const parseReport = express.json({
    type: ['application/csp-report', 'application/reports+json', 'application/json'],
    limit: '16kb',
  });
  const stack = [reportLimiter, parseReport, cspReportHandler].filter(Boolean);
  app.post(CSP_REPORT_PATH, ...stack);
}

module.exports = {
  applySecurityHeaders,
  fetchMetadataGuard,
  summariseReport,
  reportOnlyPolicy,
  stampNonce,
  sendShell,
  PERMISSIONS_POLICY,
  CSP_REPORT_PATH,
};
