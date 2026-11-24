const { safeError } = require('../lib/safe-log');
const crypto = require('crypto');
const database = require('../db/import-runs');

function requestKey(req) {
  const supplied = String(req.get?.('Idempotency-Key') || '').trim();
  return supplied ? supplied.slice(0, 200) : crypto.randomUUID();
}

function createEnqueueBasiqImportHandler(db) {
  return async function enqueueBasiqImport(req, res) {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const { run, job } = await db.enqueueImportRun(req.session.userId, {
        provider: 'basiq',
        requestKey: requestKey(req),
      });
      return res.status(202).json({
        ok: true,
        import_run_id: run.id,
        job_id: job.id,
        status: run.status,
      });
    } catch (error) {
      console.error('basiq import enqueue error:', safeError(error));
      return res.status(500).json({ error: 'Could not queue sync. Please try again.' });
    }
  };
}

function createGetImportRunHandler(db) {
  return async function getImportRun(req, res) {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const run = await db.getImportRunForUser(req.params.id, req.session.userId);
      if (!run) return res.status(404).json({ error: 'Import run not found' });
      return res.json({ import_run: run });
    } catch (error) {
      console.error('import run lookup error:', safeError(error));
      return res.status(500).json({ error: 'Could not load import run.' });
    }
  };
}

function createSaveBasiqOwnershipHandler(saveOwnerType) {
  return async function saveBasiqOwnership(req, res) {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { owner_type: owner, import_run_id: runId, account_references: refs } = req.body || {};
    if ((owner !== 'self' && owner !== 'joint') || !/^\d{1,18}$/.test(String(runId))
      || !Array.isArray(refs) || !refs.length || refs.length > 200
      || !refs.every((ref) => typeof ref === 'string' && /^basiq:[A-Za-z0-9_-]{1,200}$/.test(ref))) {
      return res.status(400).json({ error: 'Choose who owns the connected accounts.' });
    }
    try {
      const result = await saveOwnerType(userId, runId, [...new Set(refs)], owner);
      if (!result) return res.status(404).json({ error: 'Completed import or connected accounts not found.' });
      return res.json(result);
    } catch (error) {
      console.error('Basiq account ownership could not be saved:', safeError(error));
      return res.status(500).json({ error: 'Could not save who owns these accounts. Please try again.' });
    }
  };
}

module.exports = {
  requestKey,
  createEnqueueBasiqImportHandler,
  createGetImportRunHandler,
  createSaveBasiqOwnershipHandler,
  saveBasiqOwnershipHandler: createSaveBasiqOwnershipHandler(require('../db/basiq-account-ownership').setBasiqOwnerType),
  enqueueBasiqImportHandler: createEnqueueBasiqImportHandler(database),
  getImportRunHandler: createGetImportRunHandler(database),
};
