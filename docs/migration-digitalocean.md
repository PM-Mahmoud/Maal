# Migration runbook: Render (Singapore) → DigitalOcean App Platform (Sydney)

**Status:** planned · **Written:** 2026-09-29 · **Config:** [`.do/app.yaml`](../.do/app.yaml)

## Why

The app runs on Render in **Singapore**; the Neon database is in **Sydney**
(AWS `ap-southeast-2`). Every query crosses between them — measured at
**~175 ms per round-trip** (`/health`, one `SELECT 1`, ≈ 409 ms vs ≈ 233 ms for a
static file). A dashboard load needs dozens of queries, so it took **23–28 s**
(PR #76 reduces the query count but cannot remove the distance).

The database stays in Sydney: AU data residency is a non-negotiable in
`MAAL-AI-EXECUTION-PLAN.md`. Render has no Australian region, so the **app**
moves to DigitalOcean App Platform, region `syd`, next to the database.

**Expected result:** per-query cost drops from ~175 ms to a few ms; the dashboard
should load in ~1–2 s. Australian users also stop routing every click via
Singapore.

## What moves, what doesn't

| Piece | Today (Render) | After |
|---|---|---|
| Web service (`npm start`) | Render web, Singapore | DO service `web`, Sydney |
| Import worker (`npm run worker`) | Render worker | DO worker `import-worker` |
| Migrations | inside every service's build (runs 4× per deploy) | DO `PRE_DEPLOY` job, once per deploy |
| Backup verification (18:00 UTC) + backup marker (12:00 UTC) | Render cron | DO `SCHEDULED` jobs, same times |
| Database | Neon Sydney | **unchanged** |
| Vault files | Cloudflare R2 | **unchanged** |
| Domain | hellomaal.com → Render | hellomaal.com → DO |
| External cron (radar, digest, constants drift) | cron-job.org → `https://hellomaal.com/internal/...` | **unchanged** (same URLs follow the domain) |
| Logged-in users | sessions in Postgres | **stay logged in** (same DB) |

## Before you start

- [ ] PR #76 merged (it removes wasted queries regardless of host).
- [ ] A DigitalOcean account with billing set up. Rough cost for this spec:
      web 1 GB + worker 0.5 GB + short jobs — check current App Platform pricing.
- [ ] Access to wherever **hellomaal.com's DNS** is managed (registrar or Cloudflare).
- [ ] Render dashboard open on the **web service → Environment** page.
- [ ] **Neon IP allow-list:** Neon console → Settings → IP Allow. If it's on,
      you'll need to add DO's addresses (App Platform's dedicated egress IP
      add-on) or the new app can't reach the database. If it's off, skip.

## Step 1 — Lower DNS TTL (the day before)

In your DNS provider, set the TTL on the `hellomaal.com` and `www` records to
**300 seconds** (5 min). This makes the switch-over and any rollback quick.
Wait for the old TTL to pass before step 5.

## Step 2 — Create the app on DigitalOcean (no traffic yet)

1. DO dashboard → **Apps → Create App → GitHub** → authorise the
   `PM-Mahmoud/Maal` repo. Or with the CLI:
   ```bash
   doctl apps spec validate .do/app.yaml
   doctl apps create --spec .do/app.yaml
   ```
2. Confirm **region = Sydney (syd)** on every component.
3. **Temporarily remove the `domains:` block** in the dashboard (or leave the
   domain unverified) so DO doesn't try to claim hellomaal.com yet.
4. If the `SCHEDULED` job kind isn't offered in your account, delete those two
   jobs for now and see *Fallback for scheduled jobs* below.

## Step 3 — Copy environment variables

Copy **every** variable from the Render web service (and the worker/cron
services — `BACKUP_RESTORE_DATABASE_URL` lives on the backup-verification cron)
into DO → App → Settings → **App-Level Environment Variables**, ticking
**Encrypt** for each secret.

- The spec pre-declares the known keys; any extra key on Render (e.g.
  `TWILIO_*`, `MAAL_WATCHLIST`, `GATEWAY_*`, `LUNCHFLOW_REDIRECT_URI`,
  `POLSIA_ANALYTICS_SLUG`, `FEEDBACK_EMAIL`) must be added too. Compare the two
  lists side by side before continuing.
- Use the **same** `SESSION_SECRET`, `PROVIDER_TOKEN_ENCRYPTION_KEY` and
  `WEBHOOK_SECRET_ENCRYPTION_KEY` — a new value logs everyone out or makes
  stored provider tokens / webhook secrets unreadable.
- Keep `BASE_URL=https://hellomaal.com` (not the temporary DO URL).
- Never paste keys into chat, commits, or this repo (CLAUDE.md hard rule).

## Step 4 — Deploy and test on the temporary URL

DO gives the app a URL like `maal-xxxxx.ondigitalocean.app`. Deploy, then check:

- [ ] Deploy log: the `migrate` pre-deploy job succeeds (it should report no new
      migrations — Render already applied them).
- [ ] `https://<temp-url>/health` → `"status":"healthy"`, `db: true`, and every
      integration `true` that is `true` on Render today. A `false` = a missing env var.
- [ ] **Latency check** — the whole point. In a browser console on the temp URL:
      ```js
      async function t(p){const a=[];for(let i=0;i<6;i++){const s=performance.now();await fetch(p,{cache:'no-store'});a.push(performance.now()-s)}return a.sort((x,y)=>x-y)[3]}
      [await t('/favicon.ico?x='+Math.random()), await t('/health')]
      ```
      The two numbers should now be within ~10 ms of each other (on Render the
      gap is ~175 ms).
- [ ] Sign in with the **email code** (Google sign-in won't work on the temp URL —
      Google only allows registered redirect addresses; that's expected).
      Dashboard loads fast, balances and Maal Score show.
- [ ] Vault: open an existing document (R2 read) and upload a test file (R2 write).
- [ ] Worker logs show it started and is polling without errors.
- [ ] **Client IP check** (rate limiting + login lockout depend on it). See
      *Client IP behind DigitalOcean* below.

Both Render and DO are now connected to the same database. That's safe: the
worker leases each job, so two workers can't process the same one.

## Step 5 — Switch the domain

1. In DO → App → Settings → **Domains**, add `hellomaal.com` (primary) and
   `www.hellomaal.com`. DO shows the DNS records to create.
2. At your DNS provider, replace the Render records with DO's:
   - `www` → **CNAME** to the `…ondigitalocean.app` target DO shows.
   - Apex `hellomaal.com` → CNAME/ALIAS/"flattened" record to the same target,
     if your provider supports it (Cloudflare does). Otherwise follow DO's
     instructions for apex domains.
3. Wait for DO to show the domain as **Active** with a TLS certificate
   (usually minutes).
4. Check the live site: `https://hellomaal.com/health`, sign in with **Google**
   and with an email code, open the dashboard.

## Step 6 — Turn off duplicates on Render

Once hellomaal.com serves from DO:

- [ ] **Suspend** (don't delete) the Render **cron jobs** — otherwise backups
      verification/marker run twice a day.
- [ ] **Suspend** the Render **worker**.
- [ ] Leave the Render **web** service running but idle for ~1 week as a
      rollback target, then suspend it.

## Step 7 — Re-check third-party settings

The domain doesn't change, so most integrations need nothing. Verify anyway:

| Integration | Where | What to check |
|---|---|---|
| Google sign-in | Google Cloud Console → Credentials | Redirect URI `https://hellomaal.com/auth/google/callback` still listed |
| Stripe | Dashboard → Developers → Webhooks | Endpoint `https://hellomaal.com/billing/webhook`; **send a test event** and confirm 200 |
| Lunch Flow | provider console / `LUNCHFLOW_REDIRECT_URI` | Redirect points at hellomaal.com |
| Basiq | — | No redirect back to Maal (users press "Sync now") — nothing to change |
| cron-job.org | job list | Radar / digest / constants-drift URLs use hellomaal.com; next runs return 200 |
| Twilio | — | Inbound SMS is dormant; nothing to do |

## Step 8 — Final checks and clean-up

- [ ] Re-measure the dashboard load (sign in, reload, time it). Target: under ~3 s.
- [ ] Watch DO → App → **Insights** (CPU/memory) for a day; upsize the web
      instance if memory is close to the limit.
- [ ] After a quiet week: suspend/delete the Render services, and delete
      `render.yaml` in a follow-up PR.
- [ ] Update `CLAUDE.md` (Env vars section says "Render") and `DEPLOY.md`.

## Rollback

At any point before Render is deleted: point the DNS records back at Render
(TTL is 5 min), resume the Render worker and crons, and pause the DO app. No
data moves in either direction — both hosts use the same Neon database and R2
bucket — so rollback loses nothing.

## Client IP behind DigitalOcean

`server.js` sets `app.set('trust proxy', 1)`, and the login/OTP rate limiters
(`lib/rate-limiters.js`) plus login lockout key on `req.ip`. On Render this is
the visitor's IP. DO App Platform puts its own edge in front and sends the real
visitor IP in the **`do-connecting-ip`** header; with `trust proxy 1`, `req.ip`
may instead be an edge address shared by many users — meaning one person's
failed logins could rate-limit everyone behind that edge.

**Check on the temp URL (step 4):** temporarily log `req.ip` next to
`req.headers['do-connecting-ip']` on one request (no user data), and compare with
your real IP. If `req.ip` is wrong, the fix is to key the limiters on
`do-connecting-ip` when running on DO (a small PR — only trust that header
behind DO, since elsewhere a client could forge it).

## Fallback for scheduled jobs

If App Platform in your account doesn't offer `SCHEDULED` jobs, run the two
backup scripts from a GitHub Actions workflow on the same UTC schedule
(`npm ci && npm run verify:backup`, with `DATABASE_URL` /
`BACKUP_RESTORE_DATABASE_URL` / `OPERATIONAL_ALERT_WEBHOOK_URL` as repository
secrets). Note this runs from GitHub's servers, outside Australia — acceptable
for a verification job, but worth knowing.
