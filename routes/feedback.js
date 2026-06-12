// routes/feedback.js
// In-app feedback — POST /feedback from the sidebar modal.

const express = require('express');
const router = express.Router();

const { addFeedback } = require('../db/feedback');

router.post('/feedback', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not signed in.' });
  try {
    const message = String(req.body.message || '').trim().slice(0, 4000);
    if (!message) return res.status(400).json({ error: 'Tell us a little more first.' });
    await addFeedback(req.session.userId, message, String(req.body.page || '').slice(0, 200));
    res.json({ ok: true });
  } catch (err) {
    console.error('Feedback error:', err.message);
    res.status(500).json({ error: 'Could not save feedback.' });
  }
});

module.exports = router;
