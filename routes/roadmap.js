// routes/roadmap.js
// Product roadmap with community voting. Mounted at /dashboard/roadmap.

const express = require('express');
const router = express.Router();

const { findUserById } = require('../db/users');
const { getProfileByUserId } = require('../db/profiles');
const { listItems, addItem, castVote } = require('../db/roadmap');

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}
router.use(requireAuth);
router.use(function (req, res, next) { res.locals.layout = 'app-layout'; next(); });

router.get('/', async (req, res) => {
  try {
    const user = await findUserById(req.session.userId);
    const profile = await getProfileByUserId(req.session.userId);
    const items = await listItems(req.session.userId);
    res.render('dashboard-roadmap', {
      user, profile, session: req.session, items,
      pageTitle: 'Roadmap',
    });
  } catch (err) {
    console.error('/roadmap error:', err.message);
    res.status(500).render('error', { layout: false, message: 'Failed to load the roadmap.' });
  }
});

router.post('/submit', async (req, res) => {
  try {
    const title = String(req.body.title || '').trim().slice(0, 140);
    const details = String(req.body.details || '').trim().slice(0, 2000);
    if (!title) return res.status(400).json({ error: 'Give your request a short title.' });
    const id = await addItem(req.session.userId, title, details);
    res.json({ ok: true, id });
  } catch (err) {
    console.error('roadmap/submit error:', err.message);
    res.status(500).json({ error: 'Could not submit your request.' });
  }
});

router.post('/vote', async (req, res) => {
  try {
    const itemId = parseInt(req.body.itemId, 10);
    const vote = parseInt(req.body.vote, 10);
    if (!itemId || (vote !== 1 && vote !== -1)) return res.status(400).json({ error: 'Invalid vote.' });
    const result = await castVote(itemId, req.session.userId, vote);
    res.json({ ok: true, vote: result });
  } catch (err) {
    console.error('roadmap/vote error:', err.message);
    res.status(500).json({ error: 'Could not record your vote.' });
  }
});

module.exports = router;
