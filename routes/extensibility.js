'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db/extensibility');
const { normaliseScopes, encryptWebhookSecret } = require('../lib/extensibility');
const { createExtensibilityService, resolvePrincipal, principalHasScope } = require('../services/extensibility');
const service = createExtensibilityService();

async function principal(req, res, scope) {
  let value;
  try { value = await resolvePrincipal(req); }
  catch (error) { console.error('[extensibility] authentication error:', error.message); res.status(500).json({ error: 'Could not authenticate request' }); return null; }
  if (!value) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  if (scope && !principalHasScope(value, scope)) { res.status(403).json({ error: `API token requires the ${scope} scope` }); return null; }
  return value;
}

function bodyData(req) { return req.body?.data && typeof req.body.data === 'object' ? req.body.data : (req.body || {}); }

router.get('/v1/notifications', async (req, res) => {
  const user = await principal(req, res, 'read');
  if (!user) return;
  try { res.json(await db.listNotifications(user.userId, req.query.limit)); }
  catch { res.status(500).json({ error: 'Could not load notifications' }); }
});

router.post('/v1/notifications/read', async (req, res) => {
  const user = await principal(req, res, 'write');
  if (!user) return;
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    await db.markNotificationsRead(user.userId, ids);
    await db.recordActivity({ actorUserId: user.userId, subjectUserId: user.userId, action: 'notification.read', metadata: { count: ids.length }, ip: req.ip });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Could not update notifications' }); }
});

const NOTIFICATION_PREF_KEYS = new Set(['daily_digest', 'radar_email', 'radar_sms', 'portfolio_summary', 'market_alerts', 'research_reports', 'spending_alerts', 'score_changes', 'product_updates']);
router.get('/v1/notification-prefs', async (req, res) => {
  const user = await principal(req, res, 'read');
  if (!user) return;
  try {
    const { findUserById } = require('../db/users');
    const row = await findUserById(user.userId);
    res.json({ daily_digest: row?.notification_prefs?.daily_digest === true, ...(row?.notification_prefs || {}) });
  } catch { res.status(500).json({ error: 'Could not load notification preferences' }); }
});
router.post('/v1/notification-prefs', async (req, res) => {
  const user = await principal(req, res, 'write');
  if (!user) return;
  try {
    const d = bodyData(req); const key = String(d.key || '');
    if (!NOTIFICATION_PREF_KEYS.has(key)) return res.status(400).json({ error: 'Unknown preference.' });
    await require('../db/users').setNotificationPref(user.userId, key, !!d.value);
    await db.recordActivity({ actorUserId: user.userId, subjectUserId: user.userId, action: 'notification.preference_changed', resourceType: 'notification_preference', resourceId: key, metadata: { value: !!d.value }, ip: req.ip });
    res.json({ ok: true, key, value: !!d.value });
  } catch { res.status(500).json({ error: 'Could not update preference.' }); }
});

router.get('/v1/activity', async (req, res) => {
  const user = await principal(req, res, 'read'); if (!user) return;
  try { res.json(await db.listActivity(user.userId, req.query.limit)); } catch { res.status(500).json({ error: 'Could not load activity' }); }
});

router.get('/v1/automation-rules', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try { res.json(await db.listRules(req.session.userId, req.query.event_type)); } catch { res.status(500).json({ error: 'Could not load automation rules' }); }
});
router.post('/v1/automation-rules', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const d = bodyData(req); const input = service.validateRuleInput(d);
    const row = await db.createRule(req.session.userId, { ...input, active: d.active });
    await db.recordActivity({ actorUserId: req.session.userId, subjectUserId: req.session.userId, action: 'automation_rule.created', resourceType: 'automation_rule', resourceId: row.id, ip: req.ip });
    res.status(201).json(row);
  } catch (error) { res.status(400).json({ error: error.message || 'Could not create automation rule' }); }
});
router.patch('/v1/automation-rules/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const d = bodyData(req); const input = service.validateRuleInput(d);
    const row = await db.updateRule(req.session.userId, req.params.id, { ...input, active: d.active });
    if (!row) return res.status(404).json({ error: 'Automation rule not found' });
    await db.recordActivity({ actorUserId: req.session.userId, subjectUserId: req.session.userId, action: 'automation_rule.updated', resourceType: 'automation_rule', resourceId: row.id, ip: req.ip });
    res.json(row);
  } catch (error) { res.status(400).json({ error: error.message || 'Could not update automation rule' }); }
});
router.delete('/v1/automation-rules/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const row = await db.deleteRule(req.session.userId, req.params.id);
    if (!row) return res.status(404).json({ error: 'Automation rule not found' });
    await db.recordActivity({ actorUserId: req.session.userId, subjectUserId: req.session.userId, action: 'automation_rule.deleted', resourceType: 'automation_rule', resourceId: row.id, ip: req.ip });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Could not delete automation rule' }); }
});

router.get('/v1/api-tokens', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try { res.json(await db.listApiTokens(req.session.userId)); } catch { res.status(500).json({ error: 'Could not load API tokens' }); }
});
router.post('/v1/api-tokens', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const d = bodyData(req); const name = String(d.name || '').trim();
    if (!name || name.length > 100) return res.status(400).json({ error: 'Token name must be between 1 and 100 characters' });
    const scopes = normaliseScopes(d.scopes); let expiresAt = null;
    if (d.expiresAt != null && d.expiresAt !== '') { const date = new Date(d.expiresAt); if (!Number.isFinite(date.getTime()) || date <= new Date()) return res.status(400).json({ error: 'Token expiry must be a future date' }); expiresAt = date.toISOString(); }
    const token = await db.createApiToken(req.session.userId, name, scopes, expiresAt);
    await db.recordActivity({ actorUserId: req.session.userId, subjectUserId: req.session.userId, action: 'api_token.created', resourceType: 'api_token', resourceId: token.id, metadata: { scopes }, ip: req.ip });
    res.status(201).json(token);
  } catch (error) { res.status(400).json({ error: error.message || 'Could not create API token' }); }
});
router.delete('/v1/api-tokens/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try { const row = await db.revokeApiToken(req.session.userId, req.params.id); if (!row) return res.status(404).json({ error: 'API token not found' }); await db.recordActivity({ actorUserId: req.session.userId, subjectUserId: req.session.userId, action: 'api_token.revoked', resourceType: 'api_token', resourceId: row.id, ip: req.ip }); res.json({ ok: true }); }
  catch { res.status(500).json({ error: 'Could not revoke API token' }); }
});

router.get('/v1/webhooks', async (req, res) => {
  const user = await principal(req, res, 'webhooks'); if (!user) return;
  try { res.json(await db.listWebhooks(user.userId)); } catch { res.status(500).json({ error: 'Could not load webhooks' }); }
});
router.post('/v1/webhooks', async (req, res) => {
  const user = await principal(req, res, 'webhooks'); if (!user) return;
  try {
    const d = bodyData(req); const url = service.validateWebhookUrl(d.url); const events = service.normaliseEvents(d.events);
    const secret = `whsec_${crypto.randomBytes(32).toString('base64url')}`; const row = await db.createWebhook(user.userId, url, encryptWebhookSecret(secret), events);
    await db.recordActivity({ actorUserId: user.userId, subjectUserId: user.userId, action: 'webhook.created', resourceType: 'webhook', resourceId: row.id, metadata: { events }, ip: req.ip });
    res.status(201).json({ ...row, secret });
  } catch (error) { res.status(400).json({ error: error.message || 'Could not create webhook' }); }
});
router.delete('/v1/webhooks/:id', async (req, res) => {
  const user = await principal(req, res, 'webhooks'); if (!user) return;
  try { const row = await db.revokeWebhook(user.userId, req.params.id); if (!row) return res.status(404).json({ error: 'Webhook not found' }); await db.recordActivity({ actorUserId: user.userId, subjectUserId: user.userId, action: 'webhook.revoked', resourceType: 'webhook', resourceId: row.id, ip: req.ip }); res.json({ ok: true }); }
  catch { res.status(500).json({ error: 'Could not revoke webhook' }); }
});

module.exports = router;
