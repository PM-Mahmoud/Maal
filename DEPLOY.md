# Mizan — Deployment Guide

Stack: Node.js + Express + PostgreSQL (Neon) + Render

---

## Step 1 — Create a free PostgreSQL database on Neon

1. Go to **https://neon.tech** and sign up (free)
2. Create a new project → name it `mizan`
3. When prompted for a database name, use `mizan` (or leave as default)
4. On the project dashboard, click **Connection string** → copy the URL
   It looks like: `postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/mizan?sslmode=require`
5. Save this — it's your `DATABASE_URL`

---

## Step 2 — Push the code to GitHub

1. Go to **https://github.com/new** and create a new **private** repository named `mizan`
2. In your terminal, navigate to the `halalmetrics/` folder:
   ```bash
   cd path/to/halalmetrics
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/mizan.git
   git push -u origin main
   ```

---

## Step 3 — Deploy on Render

1. Go to **https://render.com** → sign in with GitHub
2. Click **New → Web Service**
3. Select your `mizan` GitHub repository
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
cd halalmetrics
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
