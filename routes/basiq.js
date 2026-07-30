// routes/basiq.js
// Bank connection flow via Basiq sandbox. Mounted at /basiq.
//
// GET /basiq/connect   -> create (or reuse) the Basiq user, redirect to consent UI
// GET /basiq/callback  -> after consent: pull accounts into linked_accounts
// GET /basiq/sync      -> re-pull balances on demand

const express = require('express');
const router = express.Router();

const basiq = require('../services/basiq');
const { findUserById, setBasiqUserId } = require('../db/users');
const importRuns = require('../db/import-runs');

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}
router.use(requireAuth);

async function ensureBasiqUser(req) {
  const user = await findUserById(req.session.userId);
  if (user.basiq_user_id) return user.basiq_user_id;
  const basiqUserId = await basiq.createBasiqUser(user.email);
  await setBasiqUserId(user.id, basiqUserId);
  return basiqUserId;
}

router.get('/connect', async (req, res) => {
  if (!basiq.hasBasiq()) {
    return res.redirect('/dashboard/transactions?basiq=nokey');
  }
  try {
    const basiqUserId = await ensureBasiqUser(req);
    const url = await basiq.getConsentUrl(basiqUserId);
    res.redirect(url);
  } catch (err) {
    console.error('Basiq connect error:', err.message);
    const reason = encodeURIComponent(String(err.message || 'unknown').slice(0, 140));
    res.redirect('/dashboard/transactions?basiq=error&reason=' + reason);
  }
});

router.get('/reauthorise', async (req, res) => {
  if (!basiq.hasBasiq()) {
    return res.redirect('/dashboard/transactions?basiq=nokey');
  }
  try {
    const basiqUserId = await ensureBasiqUser(req);
    res.redirect(await basiq.getConsentUrl(basiqUserId, 'reauthorise'));
  } catch (err) {
    console.error('Basiq reauthorise error:', err.message);
    res.redirect('/dashboard/transactions?basiq=error');
  }
});

async function syncAccountsToDb(req) {
  const minuteBucket = Math.floor(Date.now() / 60000);
  return importRuns.enqueueImportRun(req.session.userId, {
    provider: 'basiq',
    requestKey: `legacy:${req.path}:${req.session.userId}:${minuteBucket}`,
  });
}

router.get('/callback', async (req, res) => {
  try {
    const { run } = await syncAccountsToDb(req);
    res.redirect('/dashboard/transactions?basiq=queued&import_run=' + run.id);
  } catch (err) {
    console.error('Basiq callback error:', err.message);
    try {
      await require('../services/data-quality').recordDataQualityFailure(req.session.userId, {
        trigger: 'basiq_sync',
        coverage: { accounts: 'failed', transactions: 'not_run' },
        message: err.message,
      });
    } catch (qualityError) {
      console.error('Could not record Basiq data-quality failure:', qualityError.message);
    }
    res.redirect('/dashboard/transactions?basiq=error');
  }
});

router.get('/sync', async (req, res) => {
  try {
    const { run } = await syncAccountsToDb(req);
    res.redirect('/dashboard/transactions?basiq=queued&import_run=' + run.id);
  } catch (err) {
    console.error('Basiq sync error:', err.message);
    try {
      await require('../services/data-quality').recordDataQualityFailure(req.session.userId, {
        trigger: 'basiq_sync',
        coverage: { accounts: 'failed', transactions: 'not_run' },
        message: err.message,
      });
    } catch (qualityError) {
      console.error('Could not record Basiq data-quality failure:', qualityError.message);
    }
    res.redirect('/dashboard/transactions?basiq=error');
  }
});

module.exports = router;
