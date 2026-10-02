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
| Domain | www → Render (bare domain 301s to www) | www → DO; bare domain forwarded to www by GoDaddy |
| External cron (radar, digest, constants drift) | cron-job.org → `https://www.hellomaal.com/internal/...` | switch URLs to `www.` before Step 5 |
| Logged-in users | sessions in Postgres | **stay logged in** (same DB) |

## Before you start

- [ ] PR #76 merged (it removes wasted queries regardless of host).
- [ ] A DigitalOcean account with billing set up. Rough cost for this spec:
      web 1 GB + worker 0.5 GB + short jobs — check current App Platform pricing.
- [ ] Access to wherever **hellomaal.com's DNS** is managed (GoDaddy).
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
   domain unverified) so DO doesn't try to claim www.hellomaal.com yet.
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
- Set `BASE_URL=https://www.hellomaal.com` (www is the canonical host, see Step 5; not the temporary DO URL).
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

## Step 5 — Switch the domain (GoDaddy DNS)

hellomaal.com's DNS is at **GoDaddy** (nameservers `ns73/ns74.domaincontrol.com`),
which also runs the domain's **email** (MX → `secureserver.net`). GoDaddy can't
point the bare domain at App Platform (no CNAME/ALIAS at the apex), so
**`www.hellomaal.com` is the canonical host** and GoDaddy forwards the bare
domain to it. The site already works this way today (Render 301s bare → www).

**Before switching — make every integration use `www`.** A forwarded bare-domain
URL turns into a redirect, which webhooks (POST) and some cron services don't
follow. In Step 7's table, change any URL that starts `https://www.hellomaal.com/`
to `https://www.hellomaal.com/` *now*, while Render is still serving.

1. In DO → App → Settings → **Domains**, add **only** `www.hellomaal.com`.
   Choose "I'll manage my domain" (keep DNS at GoDaddy). DO shows a CNAME target
   like `maal-xxxxx.ondigitalocean.app`.
2. GoDaddy → My Products → hellomaal.com → **DNS**:
   - Edit the `www` **CNAME** (currently `mizan-ufgq.onrender.com`) → DO's target.
   - **Do not touch** MX, TXT or NS records (email and verification).
3. **Leave the bare-domain `A` record (`216.24.57.1`, Render) alone for now.**
   Render keeps 301-ing `hellomaal.com` → `www`, which now lands on DO. The
   GoDaddy forwarding is set up in Step 6, just before Render's web service is
   suspended. One fewer change on switch-over day.
4. Wait for DO to show `www.hellomaal.com` as **Active** with a certificate.
5. Check: `https://www.hellomaal.com/health` is served by DO (no
   `x-render-origin-server` header), and `https://hellomaal.com` still lands
   on `https://www.hellomaal.com`. Sign in with
   **Google** and with an email code; open the dashboard.

If, in Step 6, bare `https://hellomaal.com` shows a certificate warning after forwarding,
GoDaddy's forwarding isn't serving HTTPS for it: the fallback is moving DNS to
Cloudflare's free plan (copy every GoDaddy record first, MX included).

## Step 6 — Turn off duplicates on Render

Once www.hellomaal.com serves from DO:

- [ ] **Suspend** (don't delete) the Render **cron jobs** — otherwise backups
      verification/marker run twice a day.
- [ ] **Suspend** the Render **worker**.
- [ ] Leave the Render **web** service running for ~1 week as a rollback
      target (it also keeps redirecting the bare domain to www).
- [ ] After that week: GoDaddy → hellomaal.com → **Forwarding** → forward
      `hellomaal.com` to `https://www.hellomaal.com`, **Permanent (301)**,
      **Forward only**. GoDaddy replaces the bare-domain `A` record itself.
      Check `https://hellomaal.com` lands on www with no certificate warning,
      **then** suspend the Render web service.

## Step 7 — Re-check third-party settings

Every URL below must use `www.hellomaal.com`. Update them **before** Step 5 (see there). After the switch, verify:

| Integration | Where | What to check |
|---|---|---|
| Google sign-in | Google Cloud Console → Credentials | Redirect URI `https://www.hellomaal.com/auth/google/callback` still listed |
| Stripe | Dashboard → Developers → Webhooks | Endpoint `https://www.hellomaal.com/billing/webhook`; **send a test event** and confirm 200 |
| Lunch Flow | provider console / `LUNCHFLOW_REDIRECT_URI` | Redirect points at www.hellomaal.com |
| Basiq | — | No redirect back to Maal (users press "Sync now") — nothing to change |
| cron-job.org | job list | Radar / digest / constants-drift URLs use www.hellomaal.com; next runs return 200 |
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
