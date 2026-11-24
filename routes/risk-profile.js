'use strict';
// routes/risk-profile.js — Settings → Risk profile (/app/settings/risk-profile).
//   GET  /api/v1/risk-profile  → { questions, result, ageBand }
//   POST /api/v1/risk-profile  → { answers } — scored SERVER-SIDE (lib/risk-profile.js),
//                                 saved to user_profiles.onboarding_data.risk_profile
// Mounted at /api in server.js BEFORE routes/api.js. Ownership: the user id
// comes only from the session; db/risk-profile.js filters by user_id in SQL.

const { safeError } = require('../lib/safe-log');
const express = require('express');
const rp = require('../lib/risk-profile');

function createRiskProfileRouter({ db = require('../db/risk-profile'), now = () => new Date() } = {}) {
  const router = express.Router();

  function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    next();
  }

  router.get('/v1/risk-profile', requireAuth, async (req, res) => {
    try {
      const { riskProfile, ageBand } = await db.getRiskProfile(req.session.userId);
      res.json({ questions: rp.publicQuestions(), result: rp.toClient(riskProfile), ageBand });
    } catch (e) {
      console.error('[risk-profile] load failed:', safeError(e));
      res.status(500).json({ error: 'Could not load your risk profile.' });
    }
  });

  router.post('/v1/risk-profile', requireAuth, async (req, res) => {
    const record = rp.buildRecord(req.body && req.body.answers, now());
    if (!record) {
      const { missing } = rp.validateAnswers(req.body && req.body.answers);
      return res.status(400).json({ error: 'Please answer every question.', missing });
    }
    try {
      const saved = await db.saveRiskProfile(req.session.userId, record);
      res.json({ result: rp.toClient(saved || record) });
    } catch (e) {
      console.error('[risk-profile] save failed:', safeError(e));
      res.status(500).json({ error: 'Could not save your risk profile. Please try again.' });
    }
  });

  return router;
}

module.exports = createRiskProfileRouter();
module.exports.createRiskProfileRouter = createRiskProfileRouter;
