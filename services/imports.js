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
      console.error('basiq import enqueue error:', error.message);
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
      console.error('import run lookup error:', error.message);
      return res.status(500).json({ error: 'Could not load import run.' });
    }
  };
}

module.exports = {
  requestKey,
  createEnqueueBasiqImportHandler,
  createGetImportRunHandler,
  enqueueBasiqImportHandler: createEnqueueBasiqImportHandler(database),
  getImportRunHandler: createGetImportRunHandler(database),
};
