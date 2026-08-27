'use strict';

const crypto = require('crypto');
const storeDefault = require('../db/extensibility');
const {
  EVENTS, evaluateRule, signWebhook, validateEventType,
  decryptWebhookSecret, normaliseEvents, validateRuleInput, validateWebhookUrl,
} = require('../lib/extensibility');

const WEBHOOK_TIMEOUT_MS = 5000;

function eventEnvelope(eventType, data, now, eventId) {
  return {
    id: eventId,
    type: validateEventType(eventType),
    occurred_at: now().toISOString(),
    data: data && typeof data === 'object' ? data : {},
  };
}

function actionValue(action, key, fallback = '') {
  const value = action && action[key];
  return String(value == null ? fallback : value).trim();
}

function createExtensibilityService(dependencies = {}) {
  const store = dependencies.store || storeDefault;
  const fetchImpl = dependencies.fetch || global.fetch;
  const now = dependencies.now || (() => new Date());
  const nextEventId = dependencies.eventId || (() => crypto.randomUUID());

  async function deliverWebhook(userId, webhook, envelope) {
    const delivery = await store.createWebhookDelivery(userId, webhook.id, envelope.id, envelope);
    if (!delivery) return { status: 'skipped' };
    const body = JSON.stringify(envelope);
    const timestamp = Math.floor(now().getTime() / 1000).toString();
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Maal-Webhooks/1.0',
      'X-Maal-Event': envelope.type,
      'X-Maal-Delivery': envelope.id,
      'X-Maal-Timestamp': timestamp,
      'X-Maal-Signature': signWebhook(body, decryptWebhookSecret(webhook.secret_encrypted), timestamp),
    };
    try {
      if (typeof fetchImpl !== 'function') throw new Error('Webhook delivery is not configured');
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeout = controller ? setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS) : null;
      let response;
      try {
        response = await fetchImpl(webhook.url, { method: 'POST', headers, body, signal: controller?.signal });
      } finally {
        if (timeout) clearTimeout(timeout);
      }
      const responseText = typeof response.text === 'function' ? await response.text() : '';
      const result = {
        status: response.ok ? 'succeeded' : 'failed',
        attempts: 1,
        responseStatus: Number(response.status) || null,
        responseBody: responseText.slice(0, 500),
        deliveredAt: response.ok ? now() : null,
        error: response.ok ? null : `Webhook returned HTTP ${response.status}`,
      };
      await store.updateWebhookDelivery(delivery.id, userId, result);
      return { status: result.status, responseStatus: result.responseStatus };
    } catch (error) {
      await store.updateWebhookDelivery(delivery.id, userId, {
        status: 'failed', attempts: 1, error: String(error.message || error).slice(0, 500), deliveredAt: null,
      });
      return { status: 'failed', error: String(error.message || error).slice(0, 500) };
    }
  }

  async function publishEvent(userId, eventType, data = {}, options = {}) {
    const envelope = eventEnvelope(eventType, data, now, options.eventId || nextEventId());
    const [rules, webhooks] = await Promise.all([
      store.listRules(userId, envelope.type),
      store.listActiveWebhooks(userId, envelope.type),
    ]);
    let rulesTriggered = 0;
    let rulesSkipped = 0;
    for (const rule of rules) {
      if (!evaluateRule(rule, envelope)) continue;
      const claimed = await store.createRuleRun(userId, rule.id, envelope.id, envelope);
      if (!claimed) { rulesSkipped++; continue; }
      const action = rule.action || {};
      if (rule.action_type === 'notification') {
        await store.createNotification(
          userId,
          actionValue(action, 'type', 'automation'),
          actionValue(action, 'title', rule.name),
          actionValue(action, 'body', ''),
          { ...(action.data && typeof action.data === 'object' ? action.data : {}), event_id: envelope.id, event_type: envelope.type },
        );
      }
      await store.recordActivity({
        actorUserId: userId, subjectUserId: userId, action: 'automation.rule_triggered',
        resourceType: 'automation_rule', resourceId: rule.id,
        metadata: { event_id: envelope.id, event_type: envelope.type },
      });
      rulesTriggered++;
    }
    const webhookResults = await Promise.all(webhooks.map((webhook) => deliverWebhook(userId, webhook, envelope)));
    await store.recordActivity({
      actorUserId: userId, subjectUserId: userId, action: 'event.published', resourceType: 'event', resourceId: envelope.id,
      metadata: { event_type: envelope.type, rules_triggered: rulesTriggered, webhooks: webhookResults.length },
    });
    return {
      eventId: envelope.id,
      eventType: envelope.type,
      rulesEvaluated: rules.length,
      rulesTriggered,
      rulesSkipped,
      webhooksSucceeded: webhookResults.filter((result) => result.status === 'succeeded').length,
      webhooksFailed: webhookResults.filter((result) => result.status === 'failed').length,
      webhooksSkipped: webhookResults.filter((result) => result.status === 'skipped').length,
    };
  }

  async function notify(userId, notification, options = {}) {
    const row = await store.createNotification(
      userId, notification.type || 'system', notification.title, notification.body || null, notification.data || {},
    );
    if (options.emit !== false) {
      await publishEvent(userId, 'notification.created', { notification_id: row.id, type: notification.type || 'system' }, { eventId: options.eventId });
    }
    return row;
  }

  return {
    publishEvent, notify,
    deliverWebhook,
    validateEventType,
    validateRuleInput,
    validateWebhookUrl,
    normaliseEvents,
    events: EVENTS,
  };
}

function extractBearerToken(req) {
  const value = String(req.get?.('authorization') || req.headers?.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : null;
}

async function resolvePrincipal(req, store = storeDefault) {
  if (req.session?.userId) return { userId: req.session.userId, kind: 'session', scopes: null };
  const bearer = extractBearerToken(req);
  if (!bearer) return null;
  const token = await store.authenticateToken(bearer);
  return token ? { userId: token.user_id, kind: 'token', scopes: token.scopes || [] } : null;
}

function principalHasScope(principal, scope) {
  return principal?.kind === 'session' || principal?.scopes?.includes(scope);
}

module.exports = { WEBHOOK_TIMEOUT_MS, createExtensibilityService, extractBearerToken, resolvePrincipal, principalHasScope };
