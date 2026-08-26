'use strict';

const pool = require('./pool');
const { hashToken, createToken, normaliseScopes } = require('../lib/extensibility');

async function createNotification(userId, type, title, body, data = {}) {
  return (await pool.query(
    'INSERT INTO notifications(user_id,type,title,body,data) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [userId, type, title, body || null, JSON.stringify(data)],
  )).rows[0];
}

async function listNotifications(userId, limit = 50) {
  const bounded = Math.min(Math.max(Number(limit) || 50, 1), 100);
  return (await pool.query(
    'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2', [userId, bounded],
  )).rows;
}

async function markNotificationsRead(userId, ids = []) {
  const safeIds = ids.map(Number).filter(Number.isSafeInteger);
  if (safeIds.length) {
    await pool.query('UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND id=ANY($2::bigint[])', [userId, safeIds]);
  }
}

async function recordActivity(event = {}) {
  if (!String(event.action || '').trim()) throw new Error('Activity action is required');
  return (await pool.query(
    `INSERT INTO activity_ledger(actor_user_id,subject_user_id,action,resource_type,resource_id,metadata,ip_address)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [event.actorUserId || null, event.subjectUserId || event.actorUserId || null, String(event.action).trim(),
      event.resourceType || null, event.resourceId == null ? null : String(event.resourceId), JSON.stringify(event.metadata || {}), event.ip || null],
  )).rows[0];
}

async function listActivity(userId, limit = 100) {
  const bounded = Math.min(Math.max(Number(limit) || 100, 1), 250);
  return (await pool.query(
    `SELECT id,actor_user_id,subject_user_id,action,resource_type,resource_id,metadata,ip_address,created_at
       FROM activity_ledger WHERE subject_user_id=$1 ORDER BY created_at DESC, id DESC LIMIT $2`, [userId, bounded],
  )).rows;
}

async function createApiToken(userId, name, scopes, expiresAt) {
  const token = createToken();
  const row = (await pool.query(
    `INSERT INTO api_tokens(user_id,name,token_hash,scopes,expires_at)
     VALUES($1,$2,$3,$4,$5) RETURNING id,name,scopes,expires_at,created_at`,
    [userId, String(name).trim(), token.hash, normaliseScopes(scopes), expiresAt || null],
  )).rows[0];
  return { ...row, token: token.token };
}

async function listApiTokens(userId) {
  return (await pool.query(
    `SELECT id,name,scopes,last_used_at,expires_at,revoked_at,created_at
       FROM api_tokens WHERE user_id=$1 ORDER BY created_at DESC`, [userId],
  )).rows;
}

async function revokeApiToken(userId, id) {
  return (await pool.query(
    'UPDATE api_tokens SET revoked_at=COALESCE(revoked_at,NOW()) WHERE id=$1 AND user_id=$2 RETURNING id,revoked_at', [id, userId],
  )).rows[0] || null;
}

async function authenticateToken(token) {
  const result = await pool.query(
    `SELECT * FROM api_tokens WHERE token_hash=$1 AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at>NOW())`, [hashToken(token)],
  );
  if (!result.rows[0]) return null;
  await pool.query('UPDATE api_tokens SET last_used_at=NOW() WHERE id=$1', [result.rows[0].id]);
  return result.rows[0];
}

async function createRule(userId, input) {
  return (await pool.query(
    `INSERT INTO automation_rules(user_id,name,event_type,condition_path,condition,action_type,action,active)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId, input.name, input.eventType, input.conditionPath, JSON.stringify(input.condition), input.actionType, JSON.stringify(input.action), input.active !== false],
  )).rows[0];
}

async function listRules(userId, eventType) {
  const values = [userId];
  let filter = '';
  if (eventType) { values.push(eventType); filter = ' AND event_type=$2'; }
  return (await pool.query(`SELECT * FROM automation_rules WHERE user_id=$1${filter} ORDER BY created_at DESC, id DESC`, values)).rows;
}

async function updateRule(userId, id, input) {
  return (await pool.query(
    `UPDATE automation_rules SET name=$3,event_type=$4,condition_path=$5,condition=$6,action_type=$7,action=$8,active=$9
       WHERE user_id=$1 AND id=$2 RETURNING *`,
    [userId, id, input.name, input.eventType, input.conditionPath, JSON.stringify(input.condition), input.actionType, JSON.stringify(input.action), input.active !== false],
  )).rows[0] || null;
}

async function deleteRule(userId, id) {
  return (await pool.query('DELETE FROM automation_rules WHERE user_id=$1 AND id=$2 RETURNING id', [userId, id])).rows[0] || null;
}

async function createRuleRun(userId, ruleId, eventId, event) {
  return (await pool.query(
    `INSERT INTO automation_rule_runs(user_id,rule_id,event_id,event_type,event_payload,status)
     SELECT $1,id,$3,$4,$5,'triggered' FROM automation_rules WHERE id=$2 AND user_id=$1
     ON CONFLICT(rule_id,event_id) DO NOTHING RETURNING *`,
    [userId, ruleId, eventId, event.type, JSON.stringify(event)],
  )).rows[0] || null;
}

async function createWebhook(userId, url, secret, events) {
  return (await pool.query(
    'INSERT INTO webhooks(user_id,url,secret,events) VALUES($1,$2,$3,$4) RETURNING id,url,events,active,created_at', [userId, url, secret, events],
  )).rows[0];
}

async function listWebhooks(userId) {
  return (await pool.query(
    'SELECT id,url,events,active,created_at FROM webhooks WHERE user_id=$1 ORDER BY created_at DESC', [userId],
  )).rows;
}

async function listActiveWebhooks(userId, eventType) {
  return (await pool.query(
    `SELECT id,url,secret,events,active FROM webhooks
       WHERE user_id=$1 AND active=TRUE AND $2=ANY(events)`, [userId, eventType],
  )).rows;
}

async function revokeWebhook(userId, id) {
  return (await pool.query(
    'UPDATE webhooks SET active=FALSE WHERE user_id=$1 AND id=$2 AND active=TRUE RETURNING id,active', [userId, id],
  )).rows[0] || null;
}

async function createWebhookDelivery(userId, webhookId, eventId, event) {
  return (await pool.query(
    `INSERT INTO webhook_deliveries(user_id,webhook_id,event_id,event_type,payload)
     SELECT $1,id,$3,$4,$5 FROM webhooks WHERE id=$2 AND user_id=$1 AND active=TRUE
     ON CONFLICT(webhook_id,event_id) DO NOTHING RETURNING *`,
    [userId, webhookId, eventId, event.type, JSON.stringify(event)],
  )).rows[0] || null;
}

async function updateWebhookDelivery(id, result) {
  return (await pool.query(
    `UPDATE webhook_deliveries SET status=$2,attempts=$3,response_status=$4,response_body=$5,delivered_at=$6,error=$7
       WHERE id=$1 RETURNING *`,
    [id, result.status, result.attempts || 1, result.responseStatus || null, result.responseBody || null, result.deliveredAt || null, result.error || null],
  )).rows[0];
}

module.exports = {
  createNotification, listNotifications, markNotificationsRead, recordActivity, listActivity,
  createApiToken, listApiTokens, revokeApiToken, authenticateToken,
  createRule, listRules, updateRule, deleteRule, createRuleRun,
  createWebhook, listWebhooks, listActiveWebhooks, revokeWebhook,
  createWebhookDelivery, updateWebhookDelivery,
};
