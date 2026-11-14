'use strict';
// routes/advisor-threads.js — advisor workspace chat management for the React
// SPA: list / create / open / rename / favourite / delete chats, persist turns.
// Mounted at /api in server.js BEFORE routes/api.js so the generic /v1/:table
// handlers never see these paths.
//
// Ownership: every db call passes req.session.userId and every SQL statement in
// db/advisor.js filters by user_id — a thread id belonging to someone else
// behaves exactly like a missing one (404), never leaks or mutates.
//
// The advisor reply itself still comes from POST /api/v1/advisor/message (usage
// metering, guardrails, widgets); the client then persists the turn here.

const express = require('express');
const t = require('../lib/advisor-threads');

function createAdvisorThreadsRouter({ db = require('../db/advisor') } = {}) {
  const router = express.Router();

  function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    next();
  }

  function threadIdOr404(req, res) {
    const id = t.parseThreadId(req.params.id);
    if (!id) { res.status(404).json({ error: 'Chat not found' }); return null; }
    return id;
  }

  function fail(res, where, e) {
    console.error(`[advisor-threads] ${where} failed:`, e && e.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }

  router.get('/v1/advisor/threads', requireAuth, async (req, res) => {
    try {
      const rows = await db.listThreads(req.session.userId);
      res.json({ threads: rows.map(t.toThread) });
    } catch (e) { fail(res, 'list', e); }
  });

  router.post('/v1/advisor/threads', requireAuth, async (req, res) => {
    try {
      const title = t.sanitizeTitle(req.body && req.body.title) || t.DEFAULT_TITLE;
      const row = await db.createThread(req.session.userId, title);
      res.status(201).json({ thread: t.toThread(row) });
    } catch (e) { fail(res, 'create', e); }
  });

  // One-time import of chats a browser kept in localStorage before chats were
  // stored server-side. Bounded; every thread is created for the session user.
  router.post('/v1/advisor/threads/import', requireAuth, async (req, res) => {
    try {
      const input = Array.isArray(req.body && req.body.threads) ? req.body.threads.slice(0, t.MAX_IMPORT_THREADS) : [];
      const imported = [];
      for (const raw of input) {
        const v = t.validateMessages(Array.isArray(raw && raw.messages) ? raw.messages.slice(0, t.MAX_IMPORT_MESSAGES) : [], t.MAX_IMPORT_MESSAGES);
        if (v.error) continue;
        const title = t.sanitizeTitle(raw.title) || t.deriveTitle((v.messages.find((m) => m.role === 'user') || {}).content);
        const row = await db.createThread(req.session.userId, title);
        const updated = await db.appendThreadMessages(row.id, req.session.userId, v.messages);
        imported.push(t.toThread(updated || row));
      }
      res.json({ imported });
    } catch (e) { fail(res, 'import', e); }
  });

  router.get('/v1/advisor/threads/:id', requireAuth, async (req, res) => {
    const id = threadIdOr404(req, res); if (!id) return;
    try {
      const found = await db.getThreadMessages(id, req.session.userId);
      if (!found) return res.status(404).json({ error: 'Chat not found' });
      res.json({
        thread: t.toThread(found.thread),
        messages: found.messages.map((m) => ({
          id: String(m.id),
          role: m.role,
          content: m.content,
          created_at: m.created_at,
          ...(m.meta && typeof m.meta === 'object' ? m.meta : {}),
        })),
      });
    } catch (e) { fail(res, 'get', e); }
  });

  router.patch('/v1/advisor/threads/:id', requireAuth, async (req, res) => {
    const id = threadIdOr404(req, res); if (!id) return;
    const body = req.body || {};
    const hasTitle = Object.prototype.hasOwnProperty.call(body, 'title');
    const hasFav = Object.prototype.hasOwnProperty.call(body, 'is_favourite');
    if (!hasTitle && !hasFav) return res.status(400).json({ error: 'Nothing to update' });
    const title = hasTitle ? t.sanitizeTitle(body.title) : null;
    if (hasTitle && !title) return res.status(400).json({ error: 'Enter a name for the chat' });
    const fav = hasFav ? t.parseFavourite(body.is_favourite) : null;
    if (hasFav && fav === null) return res.status(400).json({ error: 'is_favourite must be true or false' });
    try {
      let row = null;
      if (hasTitle) {
        row = await db.renameThread(id, req.session.userId, title);
        if (!row) return res.status(404).json({ error: 'Chat not found' });
      }
      if (hasFav) {
        row = await db.setFavourite(id, req.session.userId, fav);
        if (!row) return res.status(404).json({ error: 'Chat not found' });
      }
      res.json({ thread: t.toThread(row) });
    } catch (e) { fail(res, 'update', e); }
  });

  router.delete('/v1/advisor/threads/:id', requireAuth, async (req, res) => {
    const id = threadIdOr404(req, res); if (!id) return;
    try {
      const ok = await db.deleteThread(id, req.session.userId);
      if (!ok) return res.status(404).json({ error: 'Chat not found' });
      res.json({ ok: true });
    } catch (e) { fail(res, 'delete', e); }
  });

  router.post('/v1/advisor/threads/:id/messages', requireAuth, async (req, res) => {
    const id = threadIdOr404(req, res); if (!id) return;
    const v = t.validateMessages(req.body && req.body.messages);
    if (v.error) return res.status(400).json({ error: v.error });
    try {
      const firstUser = v.messages.find((m) => m.role === 'user');
      const row = await db.appendThreadMessages(id, req.session.userId, v.messages, {
        autoTitle: firstUser ? t.deriveTitle(firstUser.content) : null,
        defaultTitle: t.DEFAULT_TITLE,
      });
      if (!row) return res.status(404).json({ error: 'Chat not found' });
      res.status(201).json({ thread: t.toThread(row) });
    } catch (e) { fail(res, 'append', e); }
  });

  return router;
}

module.exports = createAdvisorThreadsRouter();
module.exports.createAdvisorThreadsRouter = createAdvisorThreadsRouter;
