'use strict';

const assert = require('assert');
const {
  normaliseScopes, validateRuleInput, validateWebhookUrl, signWebhook,
  verifyWebhook, evaluateRule, encryptWebhookSecret, decryptWebhookSecret,
} = require('../lib/extensibility');
const { createExtensibilityService, resolvePrincipal, principalHasScope } = require('../services/extensibility');

assert.deepStrictEqual(normaliseScopes(undefined), ['read']);
assert.deepStrictEqual(normaliseScopes(['read', 'read', 'webhooks']), ['read', 'webhooks']);
assert.throws(() => normaliseScopes(['admin']), /Unsupported scope/);
assert.throws(() => validateWebhookUrl('javascript:alert(1)'), /http\(s\)/);
assert.throws(() => validateWebhookUrl('http://localhost/hook'), /local host/);
assert.throws(() => validateWebhookUrl('http://169.254.169.254/latest/meta-data'), /local host/);
assert.equal(validateWebhookUrl('https://hooks.example.test/maal'), 'https://hooks.example.test/maal');
const priorWebhookKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = 'test-only-key';
const encryptedWebhookSecret = encryptWebhookSecret('webhook-secret');
assert.notEqual(encryptedWebhookSecret, 'webhook-secret');
assert.equal(decryptWebhookSecret(encryptedWebhookSecret), 'webhook-secret');
if (priorWebhookKey === undefined) delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = priorWebhookKey;

const rule = validateRuleInput({
  name: 'Large balance changed', eventType: 'data.updated', conditionPath: 'data.amount',
  condition: { operator: 'gte', value: 100 },
  actionType: 'notification', action: { title: 'Review balance', body: 'A balance changed.' },
});
assert.equal(evaluateRule(rule, { data: { amount: 100 } }), true);
assert.equal(evaluateRule(rule, { data: { amount: 99 } }), false);
assert.throws(() => validateRuleInput({ ...rule, action: {} }), /title is required/);

const signed = signWebhook('{"ok":true}', 'secret', '1700000000');
assert.equal(verifyWebhook('{"ok":true}', signed, 'secret', '1700000000'), true);
assert.equal(verifyWebhook('{"ok":true}', signed, 'wrong', '1700000000'), false);

(async () => {
  assert.deepStrictEqual(await resolvePrincipal({ session: { userId: 42 } }, { authenticateToken: async () => null }), { userId: 42, kind: 'session', scopes: null });
  const tokenPrincipal = await resolvePrincipal({ headers: { authorization: 'Bearer maal_test' } }, { authenticateToken: async (token) => ({ user_id: 42, scopes: ['read', 'export'] , token }) });
  assert.equal(tokenPrincipal.userId, 42);
  assert.equal(principalHasScope(tokenPrincipal, 'export'), true);
  assert.equal(principalHasScope(tokenPrincipal, 'write'), false);

  const notifications = [];
  const deliveries = [];
  const claimedRuns = new Set();
  const store = {
    listRules: async () => [
      { id: 7, active: true, event_type: 'data.updated', condition_path: 'data.amount', condition: { operator: 'gte', value: 100 }, action_type: 'notification', action: { title: 'Large update', body: 'Review the update.' } },
    ],
    createNotification: async (...args) => { notifications.push(args); return { id: 11 }; },
    listActiveWebhooks: async () => [{ id: 5, url: 'https://hooks.example.test/maal', secret_encrypted: encryptWebhookSecret('hook-secret'), events: ['data.updated'], active: true }],
    createRuleRun: async (ruleId, eventId) => {
      const key = `${ruleId}:${eventId}`;
      if (claimedRuns.has(key)) return null;
      claimedRuns.add(key);
      return { id: 1 };
    },
    createWebhookDelivery: async (webhookId, eventId, event) => {
      const key = `${webhookId}:${eventId}`;
      if (deliveries.some((row) => row.key === key)) return null;
      const row = { id: deliveries.length + 1, key, webhookId, eventId, event };
      deliveries.push(row);
      return row;
    },
    updateWebhookDelivery: async (id, userId, result) => { Object.assign(deliveries.find((row) => row.id === id), { userId }, result); },
    recordActivity: async (event) => event,
  };
  const requests = [];
  const service = createExtensibilityService({ store, fetch: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 202, text: async () => 'accepted' };
  }, now: () => new Date('2026-08-27T00:00:00.000Z'), eventId: () => 'event-1' });

  const result = await service.publishEvent(42, 'data.updated', { amount: 125 });
  assert.equal(result.rulesTriggered, 1);
  assert.equal(result.webhooksSucceeded, 1);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0][0], 42);
  assert.equal(requests[0].options.headers['X-Maal-Event'], 'data.updated');
  assert.equal(verifyWebhook(requests[0].options.body, requests[0].options.headers['X-Maal-Signature'], 'hook-secret', requests[0].options.headers['X-Maal-Timestamp']), true);

  const duplicate = await service.publishEvent(42, 'data.updated', { amount: 125 });
  assert.equal(duplicate.rulesTriggered, 0);
  assert.equal(duplicate.webhooksSkipped, 1);
  assert.equal(notifications.length, 1);
  assert.equal(requests.length, 1);

  console.log('✓ extensibility validates scopes, rules and signatures and dispatches idempotent events');
})().catch((error) => { console.error(error); process.exit(1); });
