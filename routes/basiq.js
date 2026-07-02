// routes/basiq.js
// Bank connection flow via Basiq sandbox. Mounted at /basiq.
//
// GET /basiq/connect   -> create (or reuse) the Basiq user, redirect to consent UI
// GET /basiq/callback  -> after consent: pull accounts into linked_accounts
// GET /basiq/sync      -> re-pull balances on demand

const express = require('express');
const router = express.Router();

const basiq = require('../services/basiq');
const { mapBasiqAccount } = require('../lib/basiq-mapping');
const { findUserById, setBasiqUserId } = require('../db/users');
const { getAccountsByUserId, addAccount, deleteAccount } = require('../db/linked_accounts');
const { upsertBasiqTransactions } = require('../db/transactions');

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

async function syncAccountsToDb(req) {
  const user = await findUserById(req.session.userId);
  if (!user.basiq_user_id) return 0;
  const accounts = await basiq.getAccounts(user.basiq_user_id);

  // Replace previously-synced Basiq accounts with the fresh list
  const existing = await getAccountsByUserId(req.session.userId);
  for (const acc of existing) {
    if (acc.account_reference && String(acc.account_reference).startsWith('basiq:')) {
      await deleteAccount(acc.id, req.session.userId);
    }
  }
  for (const acc of accounts) {
    await addAccount(req.session.userId, mapBasiqAccount(acc));
  }

  // Persist transactions too — the dashboard widget and transactions page
  // read these from the DB instead of hitting Basiq on every page load.
  try {
    const txns = await basiq.getTransactions(user.basiq_user_id, 100);
    await upsertBasiqTransactions(req.session.userId, txns);
  } catch (e) {
    console.error('Basiq transaction sync failed:', e.message);
  }

  return accounts.length;
}

router.get('/callback', async (req, res) => {
  try {
    const count = await syncAccountsToDb(req);
    res.redirect('/dashboard/transactions?basiq=connected&accounts=' + count);
  } catch (err) {
    console.error('Basiq callback error:', err.message);
    res.redirect('/dashboard/transactions?basiq=error');
  }
});

router.get('/sync', async (req, res) => {
  try {
    const count = await syncAccountsToDb(req);
    res.redirect('/dashboard/transactions?basiq=synced&accounts=' + count);
  } catch (err) {
    console.error('Basiq sync error:', err.message);
    res.redirect('/dashboard/transactions?basiq=error');
  }
});

module.exports = router;
