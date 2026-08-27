const crypto = require('crypto');

const DEFAULT_SCOPES = Object.freeze(['read']);
const EVENTS = Object.freeze(['notification.created', 'data.updated', 'export.created', 'access.changed']);
const SCOPES = Object.freeze(['read', 'write', 'export', 'webhooks']);
const RULE_ACTIONS = Object.freeze(['notification']);
const CONDITION_OPERATORS = Object.freeze(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains']);

function normaliseScopes(scopes) {
  const values = scopes === undefined ? DEFAULT_SCOPES : (Array.isArray(scopes) ? scopes.map(String) : []);
  const unique = [...new Set(values)];
  const unsupported = unique.filter((scope) => !SCOPES.includes(scope));
  if (unsupported.length) throw new Error(`Unsupported scope: ${unsupported[0]}`);
  return unique.length ? unique : [...DEFAULT_SCOPES];
}

function createToken() {
  const token = `maal_${crypto.randomBytes(32).toString('base64url')}`;
  return { token, hash: hashToken(token) };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function webhookSecretKey() {
  const source = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY
    || process.env.PROVIDER_TOKEN_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  return source ? crypto.createHash('sha256').update(String(source)).digest() : null;
}

function encryptWebhookSecret(secret) {
  const value = String(secret || '');
  const key = webhookSecretKey();
  if (!key) {
    if (process.env.NODE_ENV === 'production') throw new Error('Webhook secret encryption is not configured');
    return `plain:${value}`;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
}

function decryptWebhookSecret(value) {
  const encoded = String(value || '');
  if (encoded.startsWith('plain:')) return encoded.slice(6);
  if (!encoded.startsWith('v1:')) return encoded; // pre-Build 9 compatibility
  const [, ivEncoded, tagEncoded, ciphertextEncoded] = encoded.split(':');
  const key = webhookSecretKey();
  if (!key || !ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error('Webhook secret encryption is not configured');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivEncoded, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, 'base64url')), decipher.final()]).toString('utf8');
}

function signWebhook(payload, secret, timestamp) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signed = timestamp == null ? raw : `${timestamp}.${raw}`;
  return `sha256=${crypto.createHmac('sha256', secret).update(signed).digest('hex')}`;
}

function verifyWebhook(payload, signature, secret, timestamp) {
  const expected = signWebhook(payload, secret, timestamp);
  const actual = String(signature || '');
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function validateEventType(eventType) {
  const value = String(eventType || '');
  if (!EVENTS.includes(value)) throw new Error(`Unsupported event type: ${value || 'missing'}`);
  return value;
}

function normaliseEvents(events) {
  const values = Array.isArray(events) ? [...new Set(events.map(String))] : [];
  if (!values.length) throw new Error('At least one webhook event is required');
  values.forEach(validateEventType);
  return values;
}

function validateRuleInput(input = {}) {
  const name = String(input.name || '').trim();
  if (!name || name.length > 120) throw new Error('Rule name must be between 1 and 120 characters');
  const eventType = validateEventType(input.eventType);
  const conditionPath = String(input.conditionPath || '').trim();
  if (!conditionPath || !/^[A-Za-z0-9_.]+$/.test(conditionPath)) throw new Error('Rule condition path is invalid');
  const condition = input.condition && typeof input.condition === 'object' && !Array.isArray(input.condition)
    ? input.condition : {};
  if (!CONDITION_OPERATORS.includes(String(condition.operator || 'eq'))) throw new Error('Unsupported condition operator');
  if (!RULE_ACTIONS.includes(String(input.actionType || 'notification'))) throw new Error('Unsupported rule action');
  const action = input.action && typeof input.action === 'object' && !Array.isArray(input.action) ? input.action : {};
  const title = String(action.title || '').trim();
  if (!title || title.length > 160) throw new Error('Notification action title is required');
  return { name, eventType, conditionPath, condition, actionType: 'notification', action };
}

function validateWebhookUrl(value) {
  const url = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('Webhook URL must be an http(s) URL without credentials or fragments');
  }
  const hostname = url.hostname.toLowerCase();
  const ipv4 = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  const octets = ipv4 ? ipv4.slice(1).map(Number) : null;
  const privateIpv4 = octets && octets.every((octet) => octet >= 0 && octet <= 255)
    && (octets[0] === 10 || octets[0] === 127 || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168) || octets.every((octet) => octet === 0));
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
    || hostname === '::1' || privateIpv4) {
    throw new Error('Webhook URL must not target a local host');
  }
  return url.toString();
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
  const path = String(rule.condition_path || rule.conditionPath || '').split('.').filter(Boolean);
  let value = event;
  for (const part of path) value = value == null ? undefined : value[part];
  return rule.active !== false && matchesCondition(value, rule.condition || {});
}

module.exports = {
  DEFAULT_SCOPES, EVENTS, SCOPES, RULE_ACTIONS, CONDITION_OPERATORS,
  normaliseScopes, createToken, hashToken, encryptWebhookSecret, decryptWebhookSecret, signWebhook, verifyWebhook,
  validateEventType, normaliseEvents, validateRuleInput, validateWebhookUrl,
  matchesCondition, evaluateRule,
};
