// routes/admin.js — Password-protected admin dashboard
// Set ADMIN_PASSWORD in Render env vars. Default is insecure — always override.

const express = require('express');
const crypto = require('crypto');
const { authLimiter } = require('../lib/rate-limiters');

function safeEqual(a, b) {
  if (!a || !b) return false;
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
const router = express.Router();
const { getAllUsers } = require('../db/users');
const { getRecentFeedback } = require('../db/feedback');

// HTML-escape helper — prevents stored XSS in admin dashboard
function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function requireAdmin(req, res, next) {
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass) return res.status(503).send('Admin not configured. Set ADMIN_PASSWORD env var.');

  // Check session
  if (req.session.isAdmin) return next();

  // Check basic auth header (for API/programmatic access)
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Basic ')) {
    const [, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
    if (safeEqual(pass, adminPass)) { req.session.isAdmin = true; return next(); }
  }

  // Show password form
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin — Maal</title>
<link rel="stylesheet" href="/css/v2-admin.css"></head>
<body class="adm adm-login"><div class="box"><h2><svg class="maal-mark" width="18" height="18" viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true"><g fill="currentColor"><rect x="0" y="0" width="1" height="7"/><rect x="6" y="0" width="1" height="7"/><rect x="1" y="1" width="1" height="1"/><rect x="5" y="1" width="1" height="1"/><rect x="2" y="2" width="1" height="1"/><rect x="3" y="3" width="1" height="1"/><rect x="4" y="2" width="1" height="1"/></g></svg>Maal Admin</h2>
${req.query.error ? '<div class="err">Incorrect password.</div>' : ''}
<form method="POST" action="/admin/login"><input type="password" name="password" placeholder="Admin password" autofocus><button>Enter</button></form>
</div></body></html>`);
}

router.post('/admin/login', authLimiter, (req, res) => {
  const adminPass = process.env.ADMIN_PASSWORD;
  if (safeEqual(req.body.password, adminPass)) {
    req.session.isAdmin = true;
    return req.session.save(() => res.redirect('/admin'));
  }
  res.redirect('/admin?error=1');
});

router.get('/admin', requireAdmin, async (req, res) => {
  const users = await getAllUsers();
  const feedback = await getRecentFeedback(100).catch(() => []);

  const total = users.length;
  const verified = users.filter(u => u.email_verified).length;
  const onboarded = users.filter(u => u.completed_onboarding).length;
  const locked = users.filter(u => u.locked_until && new Date(u.locked_until) > new Date()).length;

  const ago = d => {
    if (!d) return '—';
    const s = Math.floor((Date.now() - new Date(d)) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return new Date(d).toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' });
  };

  // Feedback + support submissions. `support:` page prefix marks the urgent ones.
  const feedbackRows = feedback.length ? feedback.map(f => {
    const isSupport = String(f.page || '').startsWith('support:');
    const where = String(f.page || '').replace(/^support:/, '') || '—';
    return `<tr>
      <td>${isSupport ? '<span class="badge danger">Support</span>' : '<span class="badge creds">Feedback</span>'}</td>
      <td><span style="color:var(--fg-muted);font-size:0.8rem">${esc(f.email) || 'anonymous'}</span></td>
      <td>${esc(f.message)}</td>
      <td style="font-size:0.8rem;color:var(--fg-muted)">${esc(where)}</td>
      <td style="font-size:0.8rem;color:var(--fg-muted);white-space:nowrap">${ago(f.created_at)}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" style="color:var(--fg-muted)">No feedback yet.</td></tr>';

  const rows = users.map(u => {
    const isLocked = u.locked_until && new Date(u.locked_until) > new Date();
    return `<tr>
      <td>${esc(u.id)}</td>
      <td><strong>${esc(u.name) || '—'}</strong><br><span style="color:var(--fg-muted);font-size:0.8rem">${esc(u.email)}</span></td>
      <td>${u.provider === 'google' ? '<span class="badge google">Google</span>' : '<span class="badge creds">Email</span>'}</td>
      <td>${u.email_verified ? '<span class="badge ok">✓ Verified</span>' : '<span class="badge warn">Unverified</span>'}</td>
      <td>${u.completed_onboarding ? '<span class="badge ok">Complete</span>' : '<span class="badge warn">Pending</span>'}</td>
      <td style="font-size:0.8rem;color:var(--fg-muted)">${ago(u.created_at)}</td>
      <td style="font-size:0.8rem;color:var(--fg-muted)">${ago(u.last_login_at)}</td>
      <td>${isLocked ? '<span class="badge danger">Locked</span>' : (u.failed_attempts > 0 ? `<span class="badge warn">${esc(u.failed_attempts)} fail${u.failed_attempts>1?'s':''}</span>` : '—')}</td>
    </tr>`;
  }).join('');

  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin — Maal</title>
<link rel="stylesheet" href="/css/v2-admin.css"></head><body class="adm">
<div class="topbar">
  <span class="topbar-logo"><svg class="maal-mark" width="18" height="18" viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true"><g fill="currentColor"><rect x="0" y="0" width="1" height="7"/><rect x="6" y="0" width="1" height="7"/><rect x="1" y="1" width="1" height="1"/><rect x="5" y="1" width="1" height="1"/><rect x="2" y="2" width="1" height="1"/><rect x="3" y="3" width="1" height="1"/><rect x="4" y="2" width="1" height="1"/></g></svg>Maal</span>
  <span class="topbar-title">Admin</span>
  <a href="/admin/waitlist" class="topbar-logout" style="margin-left:1.5rem">Waitlist</a>
  <a href="/admin/logout" class="topbar-logout" style="margin-left:auto">Sign out</a>
</div>
<div class="main">
  <div class="stats">
    <div class="stat"><div class="stat-val">${total}</div><div class="stat-label">Total users</div></div>
    <div class="stat"><div class="stat-val">${verified}</div><div class="stat-label">Verified</div></div>
    <div class="stat"><div class="stat-val">${onboarded}</div><div class="stat-label">Onboarded</div></div>
    <div class="stat"><div class="stat-val">${locked}</div><div class="stat-label">Locked accounts</div></div>
  </div>
  <div class="section-title">All users</div>
  <div class="table-wrap"><table>
    <thead><tr><th>#</th><th>User</th><th>Auth</th><th>Email</th><th>Onboarding</th><th>Signed up</th><th>Last login</th><th>Security</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>

  <div class="section-title" style="margin-top:2.5rem">Feedback &amp; support</div>
  <div class="table-wrap"><table>
    <thead><tr><th>Type</th><th>From</th><th>Message</th><th>Page</th><th>When</th></tr></thead>
    <tbody>${feedbackRows}</tbody>
  </table></div>
</div></body></html>`);
});

// ─── Waitlist: view, export, invite ─────────────────────────────────────────
const waitlistDb = require('../db/waitlist');
const waitlistGate = require('../lib/waitlist-gate');

router.get('/admin/waitlist', requireAdmin, async (req, res) => {
  const status = waitlistGate.normaliseStatus(req.query.status);
  const source = req.query.source ? waitlistGate.normaliseSource(req.query.source) : null;
  const [rows, counts] = await Promise.all([
    waitlistDb.listWaitlist({ status, source }),
    waitlistDb.waitlistCounts(),
  ]);
  const flash = req.query.invited != null
    ? `<div class="flash">Invited ${esc(req.query.invited)} ${req.query.invited === '1' ? 'person' : 'people'}${Number(req.query.failed) ? ` · ${esc(req.query.failed)} email(s) failed to send (they are still marked invited)` : ''}.</div>`
    : '';
  const day = (d) => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const badge = { pending: 'warn', invited: 'creds', joined: 'ok' };
  const qs = (o) => '?' + Object.entries(o).filter(([, v]) => v).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  const tab = (label, s) => `<a class="tab${status === s ? ' on' : ''}" href="/admin/waitlist${qs({ status: s, source })}">${label}</a>`;
  const body = rows.length ? rows.map((r) => `<tr>
      <td>${r.status === 'pending' ? `<input type="checkbox" name="ids" value="${esc(r.id)}" form="invite-form">` : ''}</td>
      <td><strong>${esc(r.name) || '—'}</strong><br><span class="muted">${esc(r.email)}</span></td>
      <td><span class="badge ${badge[r.status] || 'creds'}">${esc(r.status)}</span></td>
      <td><a class="muted" href="/admin/waitlist${qs({ status, source: r.source })}">${esc(r.source)}</a></td>
      <td>${r.consent_contact ? '✓' : '<span class="muted">no</span>'}</td>
      <td>${r.score == null ? '<span class="muted">—</span>' : esc(r.score)}</td>
      <td class="muted">${day(r.created_at)}</td>
      <td class="muted">${day(r.invited_at)}</td>
    </tr>`).join('') : '<tr><td colspan="8" class="muted">Nobody here yet.</td></tr>';

  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Waitlist — Maal Admin</title>
<link rel="stylesheet" href="/css/v2-admin.css"></head><body class="adm">
<div class="topbar"><a class="logo" href="/admin"><svg class="maal-mark" width="18" height="18" viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true"><g fill="currentColor"><rect x="0" y="0" width="1" height="7"/><rect x="6" y="0" width="1" height="7"/><rect x="1" y="1" width="1" height="1"/><rect x="5" y="1" width="1" height="1"/><rect x="2" y="2" width="1" height="1"/><rect x="3" y="3" width="1" height="1"/><rect x="4" y="2" width="1" height="1"/></g></svg>Maal</a><a href="/admin">Users</a><a href="/admin/waitlist" style="color:var(--fg)">Waitlist</a><a href="/admin/logout" style="margin-left:auto">Sign out</a></div>
<div class="main">
  ${flash}
  <p class="note">Signups are <strong>${waitlistGate.isGateOn() ? 'invite-only' : 'open to everyone'}</strong> (WAITLIST_GATE ${waitlistGate.isGateOn() ? 'on' : 'off'}). Inviting someone emails them a link to create their account.</p>
  <div class="stats">
    <div class="stat"><div class="stat-val">${counts.pending}</div><div class="stat-label">Waiting</div></div>
    <div class="stat"><div class="stat-val">${counts.invited}</div><div class="stat-label">Invited</div></div>
    <div class="stat"><div class="stat-val">${counts.joined}</div><div class="stat-label">Joined</div></div>
  </div>
  <div class="bar">
    ${tab('All', null)}${tab('Waiting', 'pending')}${tab('Invited', 'invited')}${tab('Joined', 'joined')}
    ${source ? `<span class="muted">source: ${esc(source)} · <a class="muted" href="/admin/waitlist${qs({ status })}">clear</a></span>` : ''}
    <span class="spacer"></span>
    <a class="btn ghost" href="/admin/waitlist.csv${qs({ status, source })}">Export CSV</a>
    <form id="invite-form" method="POST" action="/admin/waitlist/invite" onsubmit="return confirm('Send invite emails to the selected people?')">
      <button class="btn" type="submit">Invite selected</button>
    </form>
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th><input type="checkbox" aria-label="Select all waiting" onclick="document.querySelectorAll('input[name=ids]').forEach(c=>c.checked=this.checked)"></th><th>Person</th><th>Status</th><th>Source</th><th>Consent</th><th>Score</th><th>Joined list</th><th>Invited</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>
</div></body></html>`);
});

router.get('/admin/waitlist.csv', requireAdmin, async (req, res) => {
  const status = waitlistGate.normaliseStatus(req.query.status);
  const source = req.query.source ? waitlistGate.normaliseSource(req.query.source) : null;
  const rows = await waitlistDb.listWaitlist({ status, source });
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="maal-waitlist-${stamp}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(waitlistGate.toCsv(rows));
});

router.post('/admin/waitlist/invite', requireAdmin, async (req, res) => {
  const raw = [].concat(req.body.ids || []);
  const ids = [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500);
  const invited = await waitlistDb.markInvited(ids);
  const { sendWaitlistInvite } = require('../services/email');
  let failed = 0;
  for (const row of invited) {
    try { await sendWaitlistInvite(row.email, row.name); }
    catch (e) { failed++; console.error('[admin] invite email failed for waitlist id ' + row.id + ':', e.message); }
  }
  res.redirect(`/admin/waitlist?status=invited&invited=${invited.length}&failed=${failed}`);
});

router.get('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin'));
});

router.get('/admin/operations', requireAdmin, async (_req, res) => {
  try {
    const alerts = await require('../db/operational-resilience').listOpenAlerts();
    res.json({ alerts });
  } catch (error) {
    res.status(500).json({ error: 'Could not load operational alerts.' });
  }
});

module.exports = router;
