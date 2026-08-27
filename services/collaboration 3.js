'use strict';

const crypto = require('crypto');
const collaborationDb = require('../db/collaboration');
const { deleteUser } = require('../db/users');
const { getAssetSummary, wealthTotalsFromSummary } = require('../db/assets');
const { loadTaxReadyExport } = require('../db/financial-export');
const { serializeFinancialExport } = require('../lib/financial-export');
const {
  READ_SCOPES,
  normalizeHouseholdName,
  normalizeOwnership,
  normalizeGrant,
  isDeletionConfirmed,
} = require('../lib/collaboration');

function currentUserId(req, res) {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return req.session.userId;
}

function positiveId(value, label = 'id') {
  const text = String(value || '');
  if (!/^\d+$/.test(text) || Number(text) < 1) throw new Error(`Invalid ${label}.`);
  return text;
}

function bodyData(req) {
  return req.body && req.body.data && typeof req.body.data === 'object' ? req.body.data : (req.body || {});
}

function sendError(res, error, fallback = 'Could not update collaboration settings.') {
  const status = error.statusCode || (/^(Household name|Ownership|A valid grantee|Grant role|Grant scopes|Grant expiry|Tax year|Document type|Invalid)/.test(error.message) ? 400 : 500);
  if (status >= 500) console.error('[collaboration]', error.message);
  res.status(status).json({ error: status < 500 ? error.message : fallback });
}

async function listHouseholdsHandler(req, res) {
  const userId = currentUserId(req, res); if (!userId) return;
  try { res.json(await collaborationDb.listHouseholds(userId)); } catch (error) { sendError(res, error, 'Could not load households.'); }
}

async function createHouseholdHandler(req, res) {
  const userId = currentUserId(req, res); if (!userId) return;
  try {
    const data = bodyData(req);
    res.status(201).json(await collaborationDb.createHousehold(userId, normalizeHouseholdName(data.name)));
  } catch (error) { sendError(res, error); }
}

async function getHouseholdHandler(req, res) {
  const userId = currentUserId(req, res); if (!userId) return;
  try {
    const household = await collaborationDb.getHousehold(positiveId(req.params.householdId, 'household id'), userId);
    if (!household) return res.status(404).json({ error: 'Household not found.' });
    res.json(household);
  } catch (error) { sendError(res, error, 'Could not load household.'); }
}

async function addMemberHandler(req, res) {
  const actorId = currentUserId(req, res); if (!actorId) return;
  try {
    const data = bodyData(req);
    const userId = positiveId(data.userId || data.user_id, 'member user id');
    const row = await collaborationDb.addMember(
      positiveId(req.params.householdId, 'household id'), actorId, userId,
      normalizeOwnership(data.ownership)
    );
    if (!row) return res.status(403).json({ error: 'Only the household owner can add members.' });
    res.status(201).json(row);
  } catch (error) { sendError(res, error); }
}

async function updateMemberHandler(req, res) {
  const actorId = currentUserId(req, res); if (!actorId) return;
  try {
    const data = bodyData(req);
    const row = await collaborationDb.updateMemberOwnership(
      positiveId(req.params.householdId, 'household id'), actorId,
      positiveId(req.params.userId, 'member user id'), normalizeOwnership(data.ownership)
    );
    if (!row) return res.status(403).json({ error: 'Only the household owner can update member ownership.' });
    res.json(row);
  } catch (error) { sendError(res, error); }
}

async function removeMemberHandler(req, res) {
  const actorId = currentUserId(req, res); if (!actorId) return;
  try {
    const row = await collaborationDb.removeMember(
      positiveId(req.params.householdId, 'household id'), actorId,
      positiveId(req.params.userId, 'member user id')
    );
    if (!row) return res.status(403).json({ error: 'Only the household owner can remove a member.' });
    res.json({ ok: true });
  } catch (error) { sendError(res, error); }
}

async function listGrantsHandler(req, res) {
  const userId = currentUserId(req, res); if (!userId) return;
  try {
    const [outgoing, incoming] = await Promise.all([
      collaborationDb.listGrants(userId), collaborationDb.listIncomingGrants(userId),
    ]);
    res.json({ outgoing, incoming });
  } catch (error) { sendError(res, error, 'Could not load access grants.'); }
}

async function createGrantHandler(req, res) {
  const userId = currentUserId(req, res); if (!userId) return;
  try {
    const row = await collaborationDb.createGrant(userId, normalizeGrant(bodyData(req)));
    if (!row) return res.status(400).json({ error: 'You cannot grant access to yourself.' });
    res.status(201).json(row);
  } catch (error) { sendError(res, error); }
}

async function acceptGrantHandler(req, res) {
  const userId = currentUserId(req, res); if (!userId) return;
  try {
    const row = await collaborationDb.acceptGrant(positiveId(req.params.grantId, 'grant id'), userId);
    if (!row) return res.status(404).json({ error: 'Pending grant not found or expired.' });
    res.json(row);
  } catch (error) { sendError(res, error, 'Could not accept access grant.'); }
}

async function revokeGrantHandler(req, res) {
  const userId = currentUserId(req, res); if (!userId) return;
  try {
    const row = await collaborationDb.revokeGrant(userId, positiveId(req.params.grantId, 'grant id'));
    if (!row) return res.status(404).json({ error: 'Access grant not found.' });
    res.json(row);
  } catch (error) { sendError(res, error, 'Could not revoke access grant.'); }
}

async function listDocumentsHandler(req, res) {
  const userId = currentUserId(req, res); if (!userId) return;
  try { res.json(await collaborationDb.listDocuments(userId, req.query.taxYear || req.query.tax_year)); }
  catch (error) { sendError(res, error, 'Could not load supporting documents.'); }
}

async function linkDocumentHandler(req, res) {
  const userId = currentUserId(req, res); if (!userId) return;
  try {
    const data = bodyData(req);
    const row = await collaborationDb.linkDocument(userId, {
      vaultFileId: positiveId(data.vaultFileId || data.vault_file_id, 'Vault file id'),
      taxYear: data.taxYear === undefined ? data.tax_year : data.taxYear,
      documentType: data.documentType || data.document_type,
      entityType: data.entityType || data.entity_type,
      entityId: data.entityId || data.entity_id,
    });
    if (!row) return res.status(404).json({ error: 'Vault document not found.' });
    res.status(201).json(row);
  } catch (error) { sendError(res, error); }
}

async function unlinkDocumentHandler(req, res) {
  const userId = currentUserId(req, res); if (!userId) return;
  try {
    const row = await collaborationDb.unlinkDocument(userId, positiveId(req.params.documentId, 'document id'));
    if (!row) return res.status(404).json({ error: 'Supporting document not found.' });
    res.json({ ok: true });
  } catch (error) { sendError(res, error, 'Could not unlink supporting document.'); }
}

async function sharedScope(req, res, scope) {
  const requesterId = currentUserId(req, res); if (!requesterId) return null;
  const ownerId = positiveId(req.params.ownerUserId, 'owner user id');
  if (!READ_SCOPES.includes(scope)) return res.status(404).json({ error: 'Unknown collaboration scope.' });
  const access = await collaborationDb.getReadAccess(requesterId, ownerId, scope);
  if (!access) {
    res.status(403).json({ error: 'This read-only scope has not been granted.' });
    return null;
  }
  return { requesterId, ownerId, access };
}

async function sharedReadHandler(req, res) {
  try {
    const scope = String(req.params.scope || '').toLowerCase();
    const context = await sharedScope(req, res, scope); if (!context) return;
    if (scope === 'overview') {
      const components = await getAssetSummary(context.ownerId);
      return res.json({ ownerUserId: context.ownerId, scope, totals: wealthTotalsFromSummary(components), components });
    }
    if (scope === 'transactions') return res.json({ ownerUserId: context.ownerId, scope, transactions: await collaborationDb.listSharedTransactions(context.ownerId, req.query.limit) });
    return res.json({
      ownerUserId: context.ownerId, scope: 'documents',
      documents: (await collaborationDb.listDocuments(context.ownerId, req.query.taxYear || req.query.tax_year)).map((document) => ({
        ...document, downloadUrl: `/api/v1/collaboration/shared/${context.ownerId}/documents/${document.id}`,
      })),
    });
  } catch (error) { sendError(res, error, 'Could not load shared financial data.'); }
}

async function sharedDocumentHandler(req, res) {
  try {
    const context = await sharedScope(req, res, 'documents'); if (!context) return;
    const document = await collaborationDb.getSharedDocument(context.ownerId, positiveId(req.params.documentId, 'document id'));
    if (!document) return res.status(404).json({ error: 'Supporting document not found.' });
    const filename = (document.filename || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Type', document.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(document.content);
  } catch (error) { sendError(res, error, 'Could not load supporting document.'); }
}

async function taxExportHandler(req, res) {
  try {
    const context = await sharedScope(req, res, 'tax_export'); if (!context) return;
    const format = String(req.query.format || 'json').toLowerCase();
    if (!['json', 'csv'].includes(format)) return res.status(400).json({ error: 'Format must be json or csv.' });
    const taxYear = Number(req.query.taxYear || req.query.tax_year);
    const taxData = await loadTaxReadyExport(context.ownerId, taxYear);
    const { tax_year, tax_year_start, tax_year_end, ...data } = taxData;
    const bundle = {
      exported_at: new Date().toISOString(), schema_version: 1,
      export_type: 'tax_ready', tax_year, tax_year_start, tax_year_end, data,
    };
    const content = serializeFinancialExport(bundle, format);
    return res.json({
      filename: `maal-tax-ready-${taxYear}.${format}`,
      mime: format === 'json' ? 'application/json' : 'text/csv',
      base64: Buffer.from(content, 'utf8').toString('base64'),
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
    });
  } catch (error) { sendError(res, error, 'Could not export tax-ready data.'); }
}

async function dataPortabilityHandler(req, res) {
  const userId = currentUserId(req, res); if (!userId) return;
  try {
    const { financialExport } = require('./financial-export');
    const format = String(req.query.format || bodyData(req).format || 'json').toLowerCase();
    if (!['json', 'csv'].includes(format)) return res.status(400).json({ error: 'Format must be json or csv.' });
    res.json(await financialExport(userId, format));
  } catch (error) { sendError(res, error, 'Could not export portable data.'); }
}

async function deleteAccountHandler(req, res) {
  const userId = currentUserId(req, res); if (!userId) return;
  if (!isDeletionConfirmed(bodyData(req).confirmation)) {
    return res.status(400).json({ error: 'Type DELETE MY ACCOUNT to confirm permanent deletion.' });
  }
  try {
    await deleteUser(userId);
    req.session.destroy((error) => {
      if (error) return res.status(500).json({ error: 'Account was deleted but the session could not be closed.' });
      res.json({ ok: true });
    });
  } catch (error) { sendError(res, error, 'Could not delete account.'); }
}

module.exports = {
  listHouseholdsHandler, createHouseholdHandler, getHouseholdHandler,
  addMemberHandler, updateMemberHandler, removeMemberHandler,
  listGrantsHandler, createGrantHandler, acceptGrantHandler, revokeGrantHandler,
  listDocumentsHandler, linkDocumentHandler, unlinkDocumentHandler,
  sharedReadHandler, sharedDocumentHandler, taxExportHandler,
  dataPortabilityHandler, deleteAccountHandler,
};
