// routes/briefs.js — Home briefs: weekly recap + daily market brief + feedback.
// Mounted at /api/v1/briefs (server.js). JSON only, session-authenticated.
//
//   GET  /api/v1/briefs/weekly-recap   the signed-in user's last completed
//                                      Mon–Sun week, built from THEIR snapshots,
//                                      transactions and goals (lib/weekly-recap)
//   GET  /api/v1/briefs/market-brief   today's (Sydney) market brief, cached per day
//   POST /api/v1/briefs/feedback       "More like this" / "Less like this" →
//                                      the existing feedback table

const express = require('express');
const router = express.Router();

const briefsDb = require('../db/briefs');
const { listGoals } = require('../db/goals');
const { addFeedback } = require('../db/feedback');
const { buildWeeklyRecap, recapWindow } = require('../lib/weekly-recap');
const { getDailyBrief } = require('../services/market-brief');

function requireUser(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}
router.use(requireUser);

function addDays(iso, days) {
  return new Date(new Date(iso + 'T00:00:00Z').getTime() + days * 86400000).toISOString().slice(0, 10);
}

router.get('/weekly-recap', async (req, res) => {
  const userId = req.session.userId;
  try {
    const now = new Date();
    const win = recapWindow(now);
    const [snapshots, transactions, goals] = await Promise.all([
      briefsDb.getSnapshotsFrom(userId, addDays(win.start, -21)).catch(() => []),
      briefsDb.getTransactionsBetween(userId, win.prevStart, win.end).catch(() => []),
      listGoals(userId).catch(() => []),
    ]);
    res.json(buildWeeklyRecap({ now, snapshots, transactions, goals }));
  } catch (e) {
    console.error('[briefs] weekly recap failed:', e.message);
    res.status(500).json({ error: 'Could not build your weekly recap.' });
  }
});

router.get('/market-brief', async (req, res) => {
  try {
    res.json(await getDailyBrief());
  } catch (e) {
    console.error('[briefs] market brief failed:', e.message);
    res.status(500).json({ error: 'Could not load today’s market brief.' });
  }
});

const BRIEFS = new Set(['weekly_recap', 'market_brief']);
const VOTES = { more: 'More like this', less: 'Less like this' };

router.post('/feedback', async (req, res) => {
  const b = req.body || {};
  const brief = String(b.brief || '');
  const vote = String(b.vote || '');
  const slide = String(b.slide || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
  const period = String(b.period || '').replace(/[^0-9-]/g, '').slice(0, 10);
  if (!BRIEFS.has(brief) || !VOTES[vote] || !slide) {
    return res.status(400).json({ error: 'Invalid feedback.' });
  }
  try {
    await addFeedback(
      req.session.userId,
      `[${brief}] ${slide}: ${VOTES[vote]}`,
      `brief:${brief}:${period || 'unknown'}:${slide}`
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[briefs] feedback save failed:', e.message);
    res.status(500).json({ error: 'Could not save feedback.' });
  }
});

module.exports = router;
