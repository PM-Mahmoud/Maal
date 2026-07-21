// routes/feedback.js
// In-app feedback and support reports — POST /feedback from the sidebar modals.
//
// Two destinations, in priority order:
//   1. Postgres (`feedback` table) — the durable record. Must succeed.
//   2. Email notification to the team — best-effort, so nobody has to poll the
//      database to notice a user asked for help. A mail failure never fails the
//      request and never loses the submission.

const express = require('express');
const router = express.Router();

const { addFeedback } = require('../db/feedback');
const { sendTeamNotification } = require('../services/email');
const { findUserById } = require('../db/users');

router.post('/feedback', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not signed in.' });
  try {
    const message = String(req.body.message || '').trim().slice(0, 4000);
    if (!message) return res.status(400).json({ error: 'Tell us a little more first.' });
    const page = String(req.body.page || '').slice(0, 200);
    const userId = req.session.userId;

    await addFeedback(userId, message, page);

    // The support modal tags its page as `support:<path>`, so use that to label
    // the notification and make urgent reports obvious in the inbox.
    const kind = page.startsWith('support:') ? 'support report' : 'feedback';
    (async () => {
      let from = `user #${userId}`;
      try {
        const user = await findUserById(userId);
        if (user && user.email) from = `${user.email} (user #${userId})`;
      } catch (e) {
        console.error('[feedback] Could not look up submitter:', e.message);
      }
      await sendTeamNotification({ kind, message, from, page });
    })().catch(err => console.error(
      `[feedback] Notification email failed (submission IS saved in Postgres): ${err.message}`
    ));

    res.json({ ok: true });
  } catch (err) {
    console.error('Feedback error:', err.message);
    res.status(500).json({ error: 'Could not save feedback.' });
  }
});

module.exports = router;
