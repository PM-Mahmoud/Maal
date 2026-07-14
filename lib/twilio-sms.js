// lib/twilio-sms.js — PURE helpers for the inbound Twilio SMS webhook (PR 10).
// No network I/O. Signature validation, TwiML building, and long-message
// splitting are unit-tested (test/twilio-sms.test.js) against Twilio's own
// documented signature vector.

const crypto = require('crypto');

// Validate an inbound Twilio request signature.
// Twilio signs: the full request URL, then every POST param appended in
// alphabetical order by key as `key + value` (no separators). HMAC-SHA1 with the
// account auth token, base64-encoded, compared to the X-Twilio-Signature header.
// https://www.twilio.com/docs/usage/security#validating-requests
function expectedSignature(authToken, url, params) {
  let data = String(url || '');
  const keys = Object.keys(params || {}).sort();
  for (const k of keys) data += k + String(params[k]);
  return crypto.createHmac('sha1', String(authToken || '')).update(Buffer.from(data, 'utf-8')).digest('base64');
}

function validateTwilioSignature(authToken, url, params, signature) {
  if (!authToken || !signature) return false;
  const expected = expectedSignature(authToken, url, params);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// A TwiML response with one or more <Message> bodies.
function buildTwiml(messages) {
  const list = Array.isArray(messages) ? messages : [messages];
  const body = list.filter((m) => m != null && String(m).length)
    .map((m) => `<Message>${escapeXml(m)}</Message>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

// Split a long reply into SMS-sized chunks on word boundaries. Twilio concatenates
// segments, but very long single messages can be rejected — cap defensively.
function splitSms(text, max = 1400) {
  const t = String(text || '').trim();
  if (t.length <= max) return t ? [t] : [];
  const out = [];
  let cur = '';
  for (const word of t.split(/\s+/)) {
    if ((cur + ' ' + word).trim().length > max && cur) {
      out.push(cur.trim());
      cur = word;
    } else {
      cur = (cur ? cur + ' ' : '') + word;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

module.exports = { validateTwilioSignature, expectedSignature, buildTwiml, splitSms, escapeXml };
