// lib/rate-limiters.js
// Shared rate-limiter instances. Import from routes to avoid redefining per-file.

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { clientIP } = require('./origin-lock');

const keyGenerator = (req) => ipKeyGenerator(clientIP(req));

// Auth routes: strict — 10 requests per minute per IP
const authLimiter = rateLimit({
  keyGenerator,
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a minute.' },
});

// OTP resend: very strict — 3 per 10 minutes per IP
const otpLimiter = rateLimit({
  keyGenerator,
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests. Please wait 10 minutes.' },
});

// AI chat: 20 requests per minute per IP
const aiLimiter = rateLimit({
  keyGenerator,
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

// CSP violation reports (POST /csp-report): browsers batch these, but a broken
// page can still fire many. Cap per IP so the endpoint can't flood the logs.
const cspReportLimiter = rateLimit({
  keyGenerator,
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: false,
  legacyHeaders: false,
  message: '',
});

module.exports = { authLimiter, otpLimiter, aiLimiter, cspReportLimiter };
