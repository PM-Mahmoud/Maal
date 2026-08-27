# Maal — Deployment Guide

Stack: Node.js + Express + PostgreSQL (Neon) + Render

---

## Step 1 — Create a free PostgreSQL database on Neon

1. Go to **https://neon.tech** and sign up (free)
2. Create a new project → name it `maal`
3. When prompted for a database name, use `maal` (or leave as default)
4. On the project dashboard, click **Connection string** → copy the URL
   It looks like: `postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/maal?sslmode=require`
5. Save this — it's your `DATABASE_URL`

---

## Step 2 — Push the code to GitHub

1. Go to **https://github.com/new** and create a new **private** repository named `maal`
2. In your terminal, navigate to the `maal/` folder:
   ```bash
   cd path/to/maal
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/maal.git
   git push -u origin main
   ```

---

## Step 3 — Deploy on Render

1. Go to **https://render.com** → sign in with GitHub
2. Click **New → Web Service**
3. Select your `maal` GitHub repository
4. Render will detect `render.yaml` automatically. Confirm the settings:
   - **Build Command:** `npm install && npm run migrate`
   - **Start Command:** `npm start`
   - **Runtime:** Node
5. Click **Create Web Service**

---

## Step 4 — Set environment variables in Render

In your Render service → **Environment** tab, add:

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | `postgresql://...` | From Neon (Step 1) |
| `SESSION_SECRET` | Any long random string | Generate: `openssl rand -hex 32` |
| `BASE_URL` | `https://your-app.onrender.com` | Your Render URL (after first deploy) |
| `NODE_ENV` | `production` | Already in render.yaml |
| `PORT` | *(leave blank)* | Render sets this automatically |
| `POLSIA_EMAIL_PROXY_URL` | *(optional)* | Leave blank to disable email sending |
| `POLSIA_API_KEY` | *(optional)* | Leave blank to disable email sending |
| `POLSIA_ANALYTICS_SLUG` | *(optional)* | Leave blank to disable analytics |

> **Note:** Without `POLSIA_EMAIL_PROXY_URL`, the app works fully — signup, login, and scoring all function. Email verification and password-reset emails just silently fail (logged as errors, not surfaced to users).

---

## Step 5 — Trigger a deploy

1. Push any commit to `main` — Render redeploys automatically
2. Or in Render dashboard → **Manual Deploy → Deploy latest commit**
3. Watch the **Logs** tab — you should see:
   ```
   Running migrations...
   Migration complete: auth_schema
   Migration complete: user_profiles
   ...
   Migrations complete.
   Server running on port 10000
   ```

---

## Step 6 — Verify

- Visit `https://your-app.onrender.com/health` → should return `{"status":"healthy"}`
- Visit `https://your-app.onrender.com/` → landing page
- Visit `https://your-app.onrender.com/score` → public score calculator

---

## Local development

```bash
cd maal
cp .env.example .env         # fill in DATABASE_URL + SESSION_SECRET
npm install
npm run migrate              # run DB migrations
npm run dev                  # starts on http://localhost:3000
```

Create `.env`:
```
DATABASE_URL=postgresql://...
SESSION_SECRET=any-local-secret
BASE_URL=http://localhost:3000
NODE_ENV=development
```

---

## Object storage for Vault (Cloudflare R2 / S3)

Vault stores uploaded documents as raw `bytea` in Postgres **by default**. That
works, but every upload/download pushes the full file through Neon and counts
against its transfer allowance. Setting the four `STORAGE_*` env vars switches
Vault to S3-compatible object storage (Cloudflare R2 recommended — zero egress).

`GET /health` reports `objectStorage: true` once all four are set
(`services/storage.js` `isConfigured()`):

| Variable | Example | Notes |
|----------|---------|-------|
| `STORAGE_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | R2 account endpoint |
| `STORAGE_BUCKET` | `maal-vault` | Keep the bucket **private** |
| `STORAGE_ACCESS_KEY_ID` | *(from R2 token)* | Use an **Account** API token, scoped to the bucket, Object Read & Write |
| `STORAGE_SECRET_ACCESS_KEY` | *(from R2 token)* | Shown once at token creation |
| `STORAGE_REGION` | `auto` | `auto` for R2/B2; a real region for AWS S3 |

Notes:
- **Coexistence is automatic.** Existing `bytea`-stored files keep working; only
  *new* uploads go to object storage (`db/vault.js` reads by `storage_key` else
  `content`). No backfill needed.
- **Fail-safe fallback.** If any var is missing/wrong, `isConfigured()` returns
  false and Vault silently reverts to `bytea` — a misconfig won't break uploads.
  If uploads start failing *after* you set the vars, suspect a bad
  credential/endpoint/bucket, not the fallback.
- Set the vars on the **`app`** service (it serves uploads/downloads). Add them to
  the worker only if it touches Vault files. Prefer a **no-expiry** token (or a
  rotation reminder) — an expired token silently drops back to `bytea`.

---

## Migration gotchas

`migrate.js` loads **every `*.js` file** in `migrations/` (`.filter(f => f.endsWith('.js'))`),
runs each once, and records it in the `_migrations` table. Two traps have bitten
real deploys:

1. **Duplicate migration files fail (or bloat) deploys.** macOS/iCloud creates
   "conflicted copy" duplicates like `1756200000000_build9_extensibility 3.js`.
   `migrate.js` treats each as a *separate* migration and runs it. If a migration
   is idempotent (`CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP TRIGGER
   IF EXISTS`) the duplicate is a harmless no-op — but a non-idempotent copy will
   **fail the whole deploy**. These duplicates are now blocked by `.gitignore`
   (`* [0-9].*`). To find any that slipped in: `git ls-files | grep -E ' [0-9]+\.'`.

2. **`ON CONFLICT DO UPDATE` referencing `EXCLUDED.<col>` for a column not in the
   INSERT's column list** raises `column excluded.<col> does not exist` — and it's
   a *plan-time* error, so it fails even when no conflict occurs. This blocked
   every deploy after the canonical-wealth backfill until fixed (the `holdings`
   upsert was setting ownership columns that live on `ownership_interests`, not
   `holdings`). Lesson: an `EXCLUDED.x` reference is only valid when `x` is one of
   the inserted columns.

**Verifying a deploy actually applied the migrations** (not just that the app is
up — a failed migration keeps the *previous* build serving):
```sql
SELECT name, applied_at FROM _migrations ORDER BY applied_at DESC LIMIT 20;
```
Confirm the expected migrations are present, with recent `applied_at`, and that
there are **no** duplicate `..._name 2` / `..._name 3` rows.

---

## Known issues to fix before production

1. **Onboarding session_id bug** — `routes/onboarding.js` spreads `req.body` into
   `dataToSave` which includes `session_id`, causing a duplicate-column SQL error
   during onboarding step saves. Fix: filter out `session_id` before calling
   `upsertResponse`:
   ```js
   // In routes/onboarding.js, POST /api/step/:step
   const { session_id, ...stepData } = req.body;
   const dataToSave = { ...stepData, user_id: req.session.userId };
   await upsertResponse(session_id, step, dataToSave);
   ```
