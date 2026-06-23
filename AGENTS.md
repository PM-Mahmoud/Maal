# Maal — Agent Handoff Document
> Last updated: 2026-06-24  
> Live URL: https://hellomaal.com  
> Repo: main branch, deployed on Render (auto-deploys on push)

---

## What Maal Is

Maal is an AI-powered financial clarity platform for Australian health professionals.  
It delivers a **Financial Health Score**, **Halal/ESG Portfolio Compliance Score**, and a **personalised action plan** — no human advisor needed.  
Serves both Muslim professionals (halal portfolio) and non-Muslim professionals (ESG/ethical) from one product.

**Pricing:** Free / Pro $20/mo / Max $200/mo (AUD)  
**Disclaimer (mandatory on every page):** "Maal does not provide financial advice. Any information provided by Maal is for educational purposes only."

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + TanStack Router + Tailwind + shadcn/ui (built from Lovable) |
| Backend | Node.js + Express + EJS (legacy views still used for some routes) |
| Database | PostgreSQL on Neon (`DATABASE_URL`) |
| Deployment | Render (auto-deploy on `git push origin main`) |
| Build | `npm install && npm run migrate && npm run build:client` |

**Key directories:**
- `client/` — React SPA (Vite build → `public/app/`)
- `client/src/routes/_authenticated/` — all dashboard pages
- `client/src/components/maal/` — shared React components
- `client/src/integrations/api.ts` — Supabase-compatible adapter (proxies to Express)
- `client/src/lib/` — page-level functions (advisor, alerts, goals, etc.)
- `routes/api.js` — JSON REST API consumed by the React SPA
- `routes/dashboard.js` — Express EJS routes (still used for some server-side features)
- `services/` — external integrations (advisor AI, Basiq, Finnhub, Bing, email, SMS)
- `migrations/` — timestamped JS migration files, run by `migrate.js` on deploy

---

## Architecture: React SPA ↔ Express

The React SPA lives at `client/` and is served as a built SPA from `public/app/`.  
All Supabase calls in the Lovable-generated code are intercepted by `client/src/integrations/api.ts`, which maps them to Express REST endpoints instead.

```
React component
  → supabase.from("cash_accounts").select("*")
  → QueryBuilder → GET /api/v1/cash_accounts
  → routes/api.js → Neon DB
```

**Auth:** Express session cookies. Login/signup via `/api/auth/login` + `/api/auth/signup`.  
Same session is used by both `/api/*` and `/dashboard/*` routes.

**Express serves the React SPA** via a catch-all:
```js
app.use('*', (req, res) => res.sendFile('public/app/index.html'));
```
(After skipping `/api/`, `/dashboard/`, `/basiq/`, `/billing/`, etc.)

---

## Database Tables (Neon PostgreSQL)

### Auth & Sessions
- `users` — email, password_hash, provider, plan, basiq_user_id, two_factor_enabled
- `session` — express-session store (connect-pg-simple)

### User Data
- `user_profiles` — onboarding data, financial preferences, age_band, cash_savings, monthly_expenses
- `financial_scores` — score history (financial_health, super_health, ethical_score)
- `recommendations` — personalised action items
- `linked_accounts` — Basiq-synced accounts (institution, balance, account_reference)

### Asset/Liability Tables (migration 1750800000000 — NEW)
- `cash_accounts` — bank/brokerage accounts (label, balance, source, account_reference)
- `investments` — ETFs, stocks, crypto, managed funds (name, kind, ticker, value)
- `properties` — real estate (label, value, mortgage_balance)
- `debts` — credit cards, loans, HECS (label, kind, balance)
- `super_accounts` — superannuation (label, fund_name, balance)
- `incomes` — income sources (label, kind, annual_amount)
- `other_assets` — vehicles, valuables, etc.

### Features
- `goals` — financial goals (CRUD)
- `vault_files` — uploaded documents (bytea, multer, 10MB cap)
- `transactions` — bank transactions (Basiq-synced + manual)
- `radars` + `radar_events` — watch conditions + AI evaluation results
- `research_reports` — AI-generated research reports
- `net_worth_snapshots` — daily portfolio snapshots per user
- `roadmap_items` + `roadmap_votes` — feature voting
- `feedback` — in-app feedback submissions
- `waitlist_emails` — pre-launch signups
- `score_submissions` — anonymous calculator submissions
- `recommended_tools` — curated third-party tool catalogue
- `knowledge_chunks` — RAG embeddings (pgvector)

---

## React Pages (client/src/routes/)

| Route | File | Status |
|---|---|---|
| `/app` | `app.index.tsx` | Dashboard with KPI tiles, sparklines, AI ask bar |
| `/app/advisor` | `app.advisor.index.tsx` + `app.advisor.$threadId.tsx` | AI chat (threads in localStorage) |
| `/app/assets` | `app.assets.tsx` | Add/edit/delete assets & liabilities, Basiq connect |
| `/app/goals` | `app.goals.tsx` | Financial goals CRUD |
| `/app/radar` | `app.radar.tsx` | AI watch conditions (Radar) |
| `/app/research` | `app.research.tsx` | AI research reports |
| `/app/transactions` | `app.transactions.tsx` | Transaction list + statement upload |
| `/app/vault` | `app.vault.tsx` | Document vault (upload/download) |
| `/app/retirement` | `app.retirement.tsx` | Retirement projections |
| `/app/portfolio-plan` | `app.portfolio-plan.tsx` | Halal/ESG portfolio allocation |
| `/app/tools` | `app.tools.tsx` | Recommended tools catalogue |
| `/app/roadmap` | `app.roadmap.tsx` | Feature voting |
| `/app/report` | `app.report.tsx` | Financial report export |
| `/app/onboarding` | `app.onboarding.tsx` | 7-step onboarding wizard |

---

## API Endpoints (routes/api.js)

### Auth
- `GET /api/me` — current session user
- `POST /api/auth/login` — email/password login
- `POST /api/auth/signup` — create account
- `POST /api/auth/logout` — destroy session

### AI Advisor
- `POST /api/v1/advisor/message` — send message, get AI reply (uses services/advisor.js)
- `GET /api/v1/advisor/status` — `{ live: bool }` — is AI configured?

### Basiq (Open Banking)
- `GET /api/v1/basiq/status` — `{ connected: bool, live: bool }`
- `POST /api/v1/basiq/sync` — sync accounts + transactions, mirrors to `cash_accounts`
- `GET /basiq/connect` — redirect to Basiq consent UI (starts CDR flow)
- `GET /basiq/callback` — post-consent, pulls accounts
- `GET /basiq/sync` — manual sync redirect (legacy EJS route)

### Markets
- `GET /api/v1/markets/indices` — global indices (Finnhub)
- `GET /api/v1/markets/news` — market news (Finnhub)

### Generic Asset CRUD (all user-scoped)
- `GET /api/v1/:table` — list rows for current user (supports `?filter=col=op.val`)
- `POST /api/v1/:table` — insert row (user_id auto-injected)
- `PATCH /api/v1/:table?filter=id=eq.{id}` — update row
- `DELETE /api/v1/:table?filter=id=eq.{id}` — delete row

**Tables with real CRUD:** cash_accounts, investments, properties, debts, super_accounts, incomes, other_assets, linked_accounts, goals, transactions, profiles, score_snapshots

---

## External Integrations

| Service | Env Var(s) | Used For |
|---|---|---|
| Azure OpenAI (preferred) | `AZURE_OPENAI_ENDPOINT`, `_API_KEY`, `_DEPLOYMENT`, `_API_VERSION` | Advisor chat, Research, Radar evaluation |
| OpenAI-compatible fallback | `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | Same (e.g. Groq, Together AI) |
| Groq fallback | `GROQ_API_KEY` | Same |
| Basiq (CDR open banking) | `BASIQ_API_KEY` | Bank account connections, transactions |
| Finnhub | `FINNHUB_API_KEY` | Market data, movers, company news |
| Bing Search | `BING_SEARCH_KEY` | Research grounding |
| Stripe | `STRIPE_SECRET_KEY` | Subscriptions (Free/Pro/Max) |
| Neon PostgreSQL | `DATABASE_URL` | Everything |
| Polsia Email Proxy | `POLSIA_EMAIL_PROXY_URL`, `POLSIA_API_KEY` | Transactional email |
| Twilio | `TWILIO_*` | SMS alerts |

**Check integration health:** `GET /health` returns boolean flags for each.

---

## Chart Components

All in `client/src/components/maal/`:

- **`Sparkline.tsx`** — small inline sparkline for tile views. Props: `data`, `positive`, `markerIndices` (entry-marker dots).
- **`AreaChart.tsx`** — full interactive SVG area chart. Props: `data`, `labels`, `actualCount` (where projected begins), `showProjected`, `markerIndices`, `formatY`. Features: x-axis tick labels, crosshair tooltip, keyboard navigation (←→ Home/End), animated draw.
- **`ChartModal.tsx`** — Dialog wrapper around AreaChart. Adds: time range picker (1Y/3Y/5Y/All), actual vs projected toggle (solid history + dashed future), legend, quarterly entry markers.

The KPI sparklines on the dashboard (`KpiSparkline` in `Dashboard.tsx`) mark the last data point (today) with a ringed dot. Expand button (⤢) opens ChartModal.

---

## What Was Built (Chronological)

### Phase 1 — Foundation (May 2026)
- Full auth system (login/signup/verify/reset/2FA)
- 7-step onboarding wizard
- Financial Health Score calculator at `/score`
- PostgreSQL schema via migrations
- Express session-based auth with bcrypt

### Phase 2 — Dashboard (June 2026 early)
- Full dashboard with 5 sub-pages (scores, recommendations, accounts, profile, history)
- Portfolio recommendation engine (halal/ESG allocation, SVG donut chart)
- Recommended Tools catalogue (30 tools, tier/profile filtering)

### Phase 3 — Intelligence (June 2026)
- Provider-agnostic AI advisor (Azure → Groq → DeepSeek fallback)
- Maal Score engine (`lib/maal-score.js`) — 5 pillars (savings 25%, debt 25%, super 20%, trajectory 15%, protection 15%)
- RAG knowledge base (pgvector, 39 AU financial articles)
- Basiq CDR open banking integration
- Stripe checkout with plan persistence
- Real-time market data (Finnhub movers, indices, news)
- AI Research reports (Finnhub + Bing → Azure synthesis)
- AI Radar (scheduled watch conditions, email/SMS alerts)

### Phase 4 — React SPA Migration (June 2026)
- Replaced EJS frontend with Lovable-built React 19 SPA (TanStack Router + shadcn/ui)
- `client/src/integrations/api.ts` — Supabase-compatible adapter proxying to Express
- All `*.functions.ts` files converted from TanStack Start server functions to fetch()
- Built SPA committed to `public/app/`, served via Express catch-all
- 46 shadcn/ui components ported, all pages rendering

### Phase 5 — Fixes & Features (June 2026)
- Fixed all runtime crashes (radar .length, assets .in(), advisor session)
- **Chart upgrades:** actual/projected toggle, x-axis date ticks, expand button always visible, entry markers on sparklines
- **Real asset CRUD:** migration + API for all 7 asset tables; dashboard numbers now reflect actual entries
- **AI advisor fixed:** new `/api/v1/advisor/message` JSON endpoint (no redirect, works cross-origin within same domain)
- **Basiq reconnected:** live connect/sync buttons in Assets page, synced accounts mirror to `cash_accounts`

---

## Known Issues / Debt

1. **`/api/v1/profiles` table** — React queries `profiles` but the DB table is `user_profiles`. The CRUD handler needs a table alias or the React code needs updating.
2. **Score compute** — `/api/v1/score/compute` returns `{ total: 0 }` stub. Should call `lib/maal-score.js` with the user's actual portfolio.
3. **Dashboard KPI tiles** — currently use synthetic/seeded history data. Should read from `net_worth_snapshots` for real history.
4. **Transactions page** — reads from `transactions` table via stub. Real endpoint wired but no UI filter/search yet.
5. **Goals page** — reads/writes via real CRUD but `goals` table has no `updated_at` column update trigger.
6. **Vault** — file bytes stored in DB (bytea). Not ideal for large files; should move to S3/Cloudflare R2.
7. **Radar cron** — requires external cron hitting `GET /internal/radar/run?token=RADAR_CRON_SECRET`. Not configured.
8. **2FA** — backend implemented, front-end toggle works but the React settings page doesn't exist yet (only in EJS).
9. **Billing/settings pages** — exist in EJS at `/billing` and `/dashboard/settings` but not yet ported to React SPA routes.
10. **Mobile nav** — some React pages have layout issues on mobile (sidebar overlap).
11. **Error boundary** — React has a global error boundary but errors silently swallow after the first crash.

---

## What To Build Next (Priority Order)

### P0 — Critical Fixes
- [ ] Fix `profiles` → `user_profiles` table name mismatch in CRUD handler
- [ ] Wire score compute to real portfolio data (replace stub in `/api/v1/score/compute`)
- [ ] Replace synthetic chart history with real `net_worth_snapshots` data

### P1 — Feature Completions
- [ ] **Settings page** in React (currently EJS only) — notification prefs, 2FA toggle, plan/billing, privacy mode
- [ ] **Billing page** in React — Stripe plan upgrade/downgrade flow
- [ ] **Onboarding → Profile seeding** — after 7-step onboarding, auto-create income + super entries
- [ ] **Dashboard transaction widget** — show last 5 transactions on main dashboard
- [ ] **Cash runway widget** — uses `user_profiles.cash_savings` and `monthly_expenses`
- [ ] **Real net-worth snapshot** — daily upsert to `net_worth_snapshots` on dashboard load

### P2 — AI Enhancements
- [ ] **Advisor system prompt** — inject user's actual portfolio (cash, investments, debts, income) into context
- [ ] **Document-aware chat** — vault PDFs extracted text fed to advisor (infrastructure exists in `services/extract.js`)
- [ ] **Radar scheduling** — set up cron-job.org webhook hitting `/internal/radar/run`
- [ ] **Research history UI** — list of past research reports per user
- [ ] **Maal Score explanation** — breakdown modal explaining each of the 5 pillar scores

### P3 — Growth & Polish
- [ ] **Email flows** — welcome email on signup, weekly financial digest, radar alert emails
- [ ] **Mobile app** (React Native or PWA wrapper)
- [ ] **Public landing page improvements** — testimonials, case studies, FAQ
- [ ] **Referral system** — invite friends for plan credit
- [ ] **CSV export** — assets, transactions, net worth history
- [ ] **Halal screening** — per-holding compliance rating in portfolio page
- [ ] **Statement parsing** — upload PDF bank statement → auto-extract transactions

---

## How To Deploy

```bash
git add -A
git commit -m "Your message"
git push origin main   # triggers Render auto-deploy
```

Build command on Render: `npm install && npm run migrate && npm run build:client`

To run migrations locally: `node migrate.js`  
To preview static (no DB): `node scripts/preview-static.js` (port 4173)

---

## Agent Instructions

When working on this codebase as an agent:

1. **Always build after React changes:** `cd client && npx vite build` — the built assets in `public/app/` must be committed.
2. **For new DB tables:** create a migration in `migrations/` with timestamp > 1750800000000, then add the table name to `ASSET_TABLES` in `routes/api.js`.
3. **For new React pages:** add a route file in `client/src/routes/_authenticated/`, create a `*.functions.ts` in `client/src/lib/` that uses `fetch()` to the API, and add to the sidebar in `app.tsx`.
4. **Advisor messages** go to `POST /api/v1/advisor/message`. The advisor service supports Azure OpenAI, Groq, DeepSeek, or any OpenAI-compatible provider.
5. **Session auth** — all `/api/v1/*` routes check `req.session.userId`. The React SPA sends cookies via `credentials: "include"`.
6. **Filter syntax** — the QueryBuilder uses `?filter=col=op.val` (e.g. `kind=eq.etf`, `kind=in.(etf,stock)`). Multiple filters use `params.append`, not `params.set`.
7. **BIGINT columns** from Postgres return as strings in Node — always `Number()` before arithmetic.
8. **Test render:** `~/.local/node/bin/node scripts/render-test.js` renders every EJS view with mock locals.

