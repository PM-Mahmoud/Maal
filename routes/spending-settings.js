'use strict';
// routes/spending-settings.js — JSON API behind /app/spending/settings.
// Mounted at /api in server.js BEFORE routes/api.js so the generic /v1/:table
// handler never sees these paths.
//
//   GET    /v1/spending-settings   → { settings }
//   PATCH  /v1/spending-settings   { include_upcoming?, excluded_groups? } → { settings }
//   GET    /v1/budgets             → { budgets, total }
//   PUT    /v1/budgets             { category_group|null, monthly_amount } → { budget }
//   DELETE /v1/budgets             → reset: deletes all of the user's budgets
//   DELETE /v1/budgets/:id         → delete one budget (404 when not the user's)
//
// Every db call passes req.session.userId; db/budgets.js filters by user_id.

const { safeError } = require('../lib/safe-log');
const express = require('express');
const s = require('../lib/spending-settings');

function createSpendingSettingsRouter({ db = require('../db/budgets'), categoriesDb = null } = {}) {
  // Lazy so tests that inject `db` never load the pool.
  const catDb = () => categoriesDb || require('../db/spending-categories');
  const router = express.Router();

  function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    next();
  }
  function fail(res, where, e) {
    console.error(`[spending-settings] ${where} failed:`, safeError(e));
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }

  router.get('/v1/spending-settings', requireAuth, async (req, res) => {
    try {
      res.json({ settings: s.normaliseSettings(await db.getSettings(req.session.userId)) });
    } catch (e) { fail(res, 'get settings', e); }
  });

  router.patch('/v1/spending-settings', requireAuth, async (req, res) => {
    const v = s.validateSettingsPatch(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    try {
      const stored = await db.updateSettings(req.session.userId, v.patch);
      res.json({ settings: s.normaliseSettings(stored) });
    } catch (e) { fail(res, 'update settings', e); }
  });

  router.get('/v1/budgets', requireAuth, async (req, res) => {
    try {
      const budgets = (await db.listBudgets(req.session.userId)).map(s.toBudget);
      res.json({ budgets, total: s.totalMonthlyBudget(budgets) });
    } catch (e) { fail(res, 'list budgets', e); }
  });

  router.put('/v1/budgets', requireAuth, async (req, res) => {
    let customNames = [];
    try {
      // Custom categories (Session 2, HEL-89) can carry a budget too.
      customNames = await catDb().customCategoryNames(req.session.userId);
    } catch (e) { return fail(res, 'list custom categories', e); }
    const v = s.validateBudgetInput(req.body, customNames);
    if (v.error) return res.status(400).json({ error: v.error });
    try {
      const row = await db.upsertBudget(req.session.userId, v.budget);
      res.json({ budget: s.toBudget(row) });
    } catch (e) { fail(res, 'save budget', e); }
  });

  router.delete('/v1/budgets', requireAuth, async (req, res) => {
    try {
      const deleted = await db.deleteAllBudgets(req.session.userId);
      res.json({ ok: true, deleted });
    } catch (e) { fail(res, 'reset budgets', e); }
  });

  router.delete('/v1/budgets/:id', requireAuth, async (req, res) => {
    const id = s.parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Budget not found' });
    try {
      const ok = await db.deleteBudget(id, req.session.userId);
      if (!ok) return res.status(404).json({ error: 'Budget not found' });
      res.json({ ok: true });
    } catch (e) { fail(res, 'delete budget', e); }
  });

  return router;
}

module.exports = createSpendingSettingsRouter();
module.exports.createSpendingSettingsRouter = createSpendingSettingsRouter;
