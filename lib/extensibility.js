const crypto = require('crypto');

const DEFAULT_SCOPES = Object.freeze(['read']);
const EVENTS = Object.freeze(['notification.created', 'data.updated', 'export.created', 'access.changed']);

function normaliseScopes(scopes) {
  const values = Array.isArray(scopes) ? scopes.map(String) : DEFAULT_SCOPES;
  return [...new Set(values.filter((scope) => ['read', 'write', 'export', 'webhooks'].includes(scope)))];
}

function createToken() {
  const token = `maal_${crypto.randomBytes(32).toString('base64url')}`;
  return { token, hash: hashToken(token) };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function signWebhook(payload, secret) {
  return `sha256=${crypto.createHmac('sha256', secret).update(typeof payload === 'string' ? payload : JSON.stringify(payload)).digest('hex')}`;
}

function verifyWebhook(payload, signature, secret) {
  const expected = signWebhook(payload, secret);
  const actual = String(signature || '');
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function matchesCondition(value, condition) {
  if (!condition || typeof condition !== 'object') return false;
  switch (condition.operator || 'eq') {
    case 'eq': return value === condition.value;
    case 'neq': return value !== condition.value;
    case 'gt': return Number(value) > Number(condition.value);
    case 'gte': return Number(value) >= Number(condition.value);
    case 'lt': return Number(value) < Number(condition.value);
    case 'lte': return Number(value) <= Number(condition.value);
    case 'in': return Array.isArray(condition.value) && condition.value.includes(value);
    case 'contains': return String(value || '').toLowerCase().includes(String(condition.value || '').toLowerCase());
    default: return false;
  }
}

function evaluateRule(rule, event) {
  const path = String(rule.condition_path || '').split('.').filter(Boolean);
  let value = event;
  for (const part of path) value = value == null ? undefined : value[part];
  return rule.active !== false && matchesCondition(value, rule.condition || {});
}

module.exports = { DEFAULT_SCOPES, EVENTS, normaliseScopes, createToken, hashToken, signWebhook, verifyWebhook, matchesCondition, evaluateRule };
