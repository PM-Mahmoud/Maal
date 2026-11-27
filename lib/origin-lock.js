'use strict';

const { createHash, timingSafeEqual } = require('node:crypto');
const { isIP } = require('node:net');

const ORIGIN_HEADER = 'X-Maal-Origin-Secret';
const verifiedIP = Symbol('verified Cloudflare client IP');

function digest(value) {
  return createHash('sha256').update(value).digest();
}

function createOriginLock(secret = process.env.ORIGIN_SECRET) {
  const expected = secret?.trim() ? digest(secret) : null;

  return function originLock(req, res, next) {
    if (!expected) return next();
    if (req.path === '/health' && (req.method === 'GET' || req.method === 'HEAD')) return next();

    const header = req.get(ORIGIN_HEADER);
    if (!header || !timingSafeEqual(expected, digest(header))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const ip = req.get('CF-Connecting-IP');
    if (isIP(ip)) req[verifiedIP] = ip;
    return next();
  };
}

function clientIP(req) {
  return req[verifiedIP] || req.ip;
}

module.exports = { ORIGIN_HEADER, createOriginLock, clientIP };
