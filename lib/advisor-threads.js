'use strict';
// lib/advisor-threads.js — pure validation helpers for advisor chat management
// (favourite / rename / delete / persisted messages). No I/O — deterministic-
// tested in test/advisor-threads.test.js.

const DEFAULT_TITLE = 'New chat';
const TITLE_MAX = 80;
const CONTENT_MAX = 20000;
const META_MAX_BYTES = 32 * 1024; // server JSON body limit is 50kb
const MAX_MESSAGES_PER_APPEND = 2;   // one user turn + one advisor reply
const MAX_IMPORT_THREADS = 20;
const MAX_IMPORT_MESSAGES = 200;

/** Collapse whitespace, strip control chars, cap length. Returns null when empty. */
function sanitizeTitle(raw) {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > TITLE_MAX ? s.slice(0, TITLE_MAX).trimEnd() : s;
}

/** A title derived from the first user message (first line, ≤ 60 chars, word boundary). */
function deriveTitle(firstMessage) {
  const s = sanitizeTitle(String(firstMessage || '').split('\n')[0]);
  if (!s) return DEFAULT_TITLE;
  if (s.length <= 60) return s;
  const cut = s.slice(0, 60);
  const sp = cut.lastIndexOf(' ');
  return (sp > 30 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

/** advisor_sessions.id is BIGSERIAL — accept only a positive integer string/number. */
function parseThreadId(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!/^[1-9]\d{0,17}$/.test(s)) return null;
  return s;
}

function parseFavourite(raw) {
  if (raw === true || raw === 'true' || raw === 1) return true;
  if (raw === false || raw === 'false' || raw === 0) return false;
  return null;
}

/**
 * Keep only the known rich parts of an advisor reply, bounded in size.
 * Widgets are persisted as returned by the server (their data was filled
 * server-side from the user's own records); follow-ups/citations are strings.
 */
function sanitizeMeta(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  if (Array.isArray(raw.widgets) && raw.widgets.length) {
    out.widgets = raw.widgets
      .filter((w) => w && typeof w === 'object' && typeof w.type === 'string' && typeof w.source === 'string')
      .slice(0, 6);
  }
  if (Array.isArray(raw.followUps) && raw.followUps.length) {
    out.followUps = raw.followUps.filter((q) => typeof q === 'string' && q.trim()).map((q) => q.slice(0, 200)).slice(0, 6);
  }
  if (Array.isArray(raw.citations) && raw.citations.length) {
    out.citations = raw.citations
      .filter((c) => c && typeof c.label === 'string')
      .map((c) => ({ label: c.label.slice(0, 120) }))
      .slice(0, 10);
  }
  for (const k of Object.keys(out)) if (!out[k].length) delete out[k];
  if (!Object.keys(out).length) return null;
  if (Buffer.byteLength(JSON.stringify(out), 'utf8') > META_MAX_BYTES) {
    delete out.widgets; // drop the heavy part rather than reject the turn
    if (!Object.keys(out).length) return null;
  }
  return out;
}

/** Validate a batch of messages to append. Returns { messages } or { error }. */
function validateMessages(raw, max = MAX_MESSAGES_PER_APPEND) {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'messages required' };
  if (raw.length > max) return { error: `at most ${max} messages per request` };
  const messages = [];
  for (const m of raw) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return { error: 'invalid role' };
    if (typeof m.content !== 'string' || !m.content.trim()) return { error: 'content required' };
    messages.push({
      role: m.role,
      content: m.content.slice(0, CONTENT_MAX),
      meta: m.role === 'assistant' ? sanitizeMeta(m.meta) : null,
    });
  }
  return { messages };
}

/** Shape a DB row for the client. */
function toThread(row) {
  return {
    id: String(row.id),
    title: row.title || DEFAULT_TITLE,
    is_favourite: !!row.is_favourite,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

module.exports = {
  DEFAULT_TITLE, TITLE_MAX, CONTENT_MAX, MAX_IMPORT_THREADS, MAX_IMPORT_MESSAGES,
  sanitizeTitle, deriveTitle, parseThreadId, parseFavourite, sanitizeMeta, validateMessages, toThread,
};
