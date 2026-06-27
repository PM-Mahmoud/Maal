// routes/admin.js — Password-protected admin dashboard
// Set ADMIN_PASSWORD in Render env vars. Default is insecure — always override.

const express = require('express');
const router = express.Router();
const { getAllUsers } = require('../db/users');

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
    if (pass === adminPass) { req.session.isAdmin = true; return next(); }
  }

  // Show password form
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Admin — Maal</title>
<style>body{background:#0A0F0D;color:#F0EFE9;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{background:#0F2E24;border:1px solid rgba(201,168,76,0.15);border-radius:16px;padding:2.5rem;width:360px}
h2{color:#C9A84C;margin:0 0 1.5rem;font-size:1.2rem}
input{width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(201,168,76,0.2);border-radius:8px;padding:0.7rem 0.9rem;color:#F0EFE9;font-size:0.95rem;outline:none;box-sizing:border-box;margin-bottom:1rem}
button{width:100%;background:#C9A84C;color:#0A0F0D;font-weight:600;padding:0.75rem;border:none;border-radius:8px;cursor:pointer;font-size:0.95rem}
.err{color:#E07070;font-size:0.85rem;margin-bottom:0.75rem}</style></head>
<body><div class="box"><h2>◈ Maal Admin</h2>
${req.query.error ? '<div class="err">Incorrect password.</div>' : ''}
<form method="POST" action="/admin/login"><input type="password" name="password" placeholder="Admin password" autofocus><button>Enter</button></form>
</div></body></html>`);
}

router.post('/admin/login', (req, res) => {
  const adminPass = process.env.ADMIN_PASSWORD;
  if (req.body.password === adminPass) {
    req.session.isAdmin = true;
    return req.session.save(() => res.redirect('/admin'));
  }
  res.redirect('/admin?error=1');
});

router.get('/admin', requireAdmin, async (req, res) => {
  const users = await getAllUsers();

  const total = users.length;
  const verified = users.filter(u => u.email_verified).length;
  const onboarded = users.filter(u => u.completed_onboarding).length;
  const locked = users.filter(u => u.locked_until && new Date(u.locked_until) > new Date()).length;

  const rows = users.map(u => {
    const isLocked = u.locked_until && new Date(u.locked_until) > new Date();
    const ago = d => {
      if (!d) return '—';
      const s = Math.floor((Date.now() - new Date(d)) / 1000);
      if (s < 60) return `${s}s ago`;
      if (s < 3600) return `${Math.floor(s/60)}m ago`;
      if (s < 86400) return `${Math.floor(s/3600)}h ago`;
      return new Date(d).toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' });
    };
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
<style>
:root{--bg:#0A0F0D;--fg:#F0EFE9;--fg-muted:#8A8D83;--accent:#C9A84C;--green-deep:#0F2E24;--border:rgba(201,168,76,0.15)}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--fg);font-family:'DM Sans',system-ui,sans-serif;min-height:100vh}
.topbar{background:rgba(15,46,36,0.9);border-bottom:1px solid var(--border);padding:0 2rem;height:56px;display:flex;align-items:center;gap:1rem}
.topbar-logo{font-size:1.1rem;font-weight:600;color:var(--accent)}
.topbar-title{font-size:0.85rem;color:var(--fg-muted)}
.topbar-logout{margin-left:auto;font-size:0.8rem;color:var(--fg-muted);text-decoration:none}
.topbar-logout:hover{color:var(--fg)}
.main{padding:2rem}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:2rem}
.stat{background:var(--green-deep);border:1px solid var(--border);border-radius:12px;padding:1.25rem}
.stat-val{font-size:2rem;font-weight:700;color:var(--accent);line-height:1}
.stat-label{font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--fg-muted);margin-top:0.35rem}
table{width:100%;border-collapse:collapse;background:var(--green-deep);border:1px solid var(--border);border-radius:12px;overflow:hidden}
thead tr{background:rgba(201,168,76,0.06)}
th{font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--fg-muted);padding:0.75rem 1rem;text-align:left;border-bottom:1px solid var(--border)}
td{padding:0.85rem 1rem;border-bottom:1px solid rgba(255,255,255,0.04);font-size:0.875rem;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(255,255,255,0.02)}
.badge{font-size:0.7rem;font-weight:600;padding:0.2rem 0.5rem;border-radius:4px;display:inline-block}
.badge.ok{background:rgba(126,212,166,0.12);color:#7ED4A6;border:1px solid rgba(126,212,166,0.25)}
.badge.warn{background:rgba(201,168,76,0.1);color:var(--accent);border:1px solid rgba(201,168,76,0.2)}
.badge.danger{background:rgba(224,112,112,0.12);color:#E07070;border:1px solid rgba(224,112,112,0.25)}
.badge.google{background:rgba(66,133,244,0.12);color:#4285F4;border:1px solid rgba(66,133,244,0.25)}
.badge.creds{background:rgba(255,255,255,0.06);color:var(--fg-muted);border:1px solid var(--border)}
.section-title{font-size:0.85rem;font-weight:600;color:var(--fg-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:1rem}
</style></head><body>
<div class="topbar">
  <span class="topbar-logo">◈ Maal</span>
  <span class="topbar-title">Admin</span>
  <a href="/admin/logout" class="topbar-logout">Sign out</a>
</div>
<div class="main">
  <div class="stats">
    <div class="stat"><div class="stat-val">${total}</div><div class="stat-label">Total users</div></div>
    <div class="stat"><div class="stat-val">${verified}</div><div class="stat-label">Verified</div></div>
    <div class="stat"><div class="stat-val">${onboarded}</div><div class="stat-label">Onboarded</div></div>
    <div class="stat"><div class="stat-val">${locked}</div><div class="stat-label">Locked accounts</div></div>
  </div>
  <div class="section-title">All users</div>
  <table>
    <thead><tr><th>#</th><th>User</th><th>Auth</th><th>Email</th><th>Onboarding</th><th>Signed up</th><th>Last login</th><th>Security</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div></body></html>`);
});

router.get('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin'));
});

module.exports = router;
