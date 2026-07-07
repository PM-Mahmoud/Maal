# React-canonical migration — parity audit (step 1)

**Date:** 2026-07-05 · **Decision:** React (`client/`) is the canonical frontend; EJS retired once
parity is proven (see `project-frontend-consolidation` memory + `maal-handoff-2026-07-05.md`).

This is the **endpoint/data parity map**: every React data dependency vs. what the Neon backend
actually serves today. It's the checklist that feeds migration steps 2–7. No feature code yet.

## Method
Audited `client/src/**` for `supabase.from('table')` (the PostgREST-style adapter in
`integrations/api.ts`) and `fetch('/api/v1/...')` calls, then matched each against the real backend
surface in `routes/api.js` and the migration files. Verified table existence against `migrations/`.

## Backend surface that exists TODAY (`routes/api.js`)
- **Auth (real):** `/api/me`, `/api/auth/login`, `/api/auth/signup`, `/api/auth/logout`, `/auth/google`.
- **Dedicated real endpoints:** `/api/v1/advisor/message`, `/v1/advisor/status`,
  `/v1/basiq/status`, `/v1/basiq/sync`, `/v1/markets/indices`, `/v1/markets/news`,
  `/v1/notifications` (returns `[]` — stub by design).
- **Generic IDOR-safe CRUD** `/api/v1/:table` — enforces `req.session.userId`, scopes every query
  by `user_id`. Whitelist (`ASSET_TABLES`): `cash_accounts, investments, properties, debts,
  super_accounts, incomes, other_assets, linked_accounts, goals, transactions, score_snapshots`.
- **Any table/path not covered → safe empty stub** (`[]` on GET, `{ok:true}` on write). This is why
  broken screens look empty rather than erroring.

## Parity matrix

| React data dependency | Used by (screen) | Backend status | Gap / action |
|---|---|---|---|
| `from('cash_accounts')` | assets, goals, onboarding | ✅ real (whitelisted) | none |
| `from('investments')` | assets, goals, onboarding | ✅ real | none |
| `from('super_accounts')` | assets, goals, onboarding | ✅ real | none |
| `from('debts')` | assets, onboarding | ✅ real | none |
| `from('incomes')` | onboarding | ✅ real | none |
| `from('properties')` | assets | ✅ real | none |
| `from('other_assets')` | assets | ✅ real (whitelisted) | none |
| `from('profiles')` / `from('user_profiles')` | onboarding, portfolio-plan | ❌ **stub** — `user_profiles` is deliberately excluded from generic API; `profiles` table doesn't exist | **Build** `GET/PATCH /api/v1/profile` backed by `db/profiles.js` (profile read/write is core; currently returns `[]`) |
| `from('preferences')` | onboarding, portfolio-plan | ❌ **stub** — no `preferences` table (0 migration refs) | Decide: fold into `user_profiles.onboarding_data` (where EJS keeps prefs) and expose via the profile endpoint |
| `from('score_snapshots')` | (score history) | ❌ **broken** — whitelisted but table **does not exist** (0 migration refs); GET throws → `[]` | **Build** `GET /api/v1/score` from `lib/maal-score.js` + history from `financial_scores` (score_type='maal_score'). Remove `score_snapshots` from whitelist or create the table |
| `fetch('/api/v1/transactions')` | transactions | ✅ table whitelisted | Verify row shape matches React's expectation; `db/transactions.js` exists |
| `fetch('/api/v1/goals')` | goals | ✅ whitelisted | none (confirm shape) |
| `fetch('/api/v1/vault', '/vault/:id')` | vault | ❌ **not implemented** | **Build** vault endpoints over `db/vault.js` + `vault_files` table (bytea). Multipart upload + download |
| `fetch('/api/v1/research', '/generate', '/:id')` | research | ❌ **not implemented** | **Build** over `services/research.js` + `db/research.js` (`research_reports` table exists) |
| `fetch('/api/v1/alerts', '/toggle', '/evaluate', '/:id')` + `/radar/readiness` + `/radar-templates` | radar | ❌ **not implemented** | **Build** over `services/radar.js` + `db/radar.js` (`radars`/`radar_events` tables exist) |
| `fetch('/api/v1/retirement/scenarios', '/:id')` | retirement | ❌ **not implemented** — no `retirement_scenarios` table | **Build** table + endpoints, OR keep client-side (see calculators note) |
| `fetch('/api/v1/report')` | report | ❌ **not implemented** | Build, or replace `lib/report.functions.ts` (see red flag below) |
| `fetch('/api/v1/push/subscribe','/unsubscribe')` | notifications | ❌ **not implemented** | Low priority; web-push not in EJS either |
| `localStorage` only | debt-payoff, tax-optimizer | ⚠️ not backed | Wire inputs to real profile/debts data once `/api/v1/profile` exists |
| `ai.gateway.lovable.dev` | report (`lib/report.functions.ts`) | 🚩 **dead + wrong** — reads `process.env.LOVABLE_API_KEY`, undefined in Vite client → returns placeholder | **Replace** with `POST /api/v1/advisor/message` (real server advisor w/ Azure + RAG + Isaacus + guardrails). Never call an AI gateway from the client |

## Cross-cutting findings
1. **Missing tables referenced by React:** `score_snapshots`, `preferences`, `retirement_scenarios`
   (0 migration refs each). Reads silently degrade to `[]`.
2. **Real data that exists in EJS but has NO `/api/v1` bridge yet:** `financial_scores` (score),
   `vault_files` (vault), `research_reports` (research), `radars`/`radar_events` (radar),
   `net_worth_snapshots` (dashboard tiles/charts), `user_profiles` (profile). These are the bulk of
   the migration build-out — the tables and `db/` modules already exist; they just need thin,
   IDOR-safe `/api/v1` handlers (follow the existing `/v1/basiq/sync` pattern: check
   `req.session.userId`, reuse the `db/` function).
3. **Dead client-side AI path** (`lib/report.functions.ts`) — see red flag row. Must route through
   the server advisor so education-only guardrails + Isaacus + RAG apply. Compliance-relevant.
4. **Hardcoded score** — the marketing homepage `ScoreCard` shows a static `82`; the authenticated
   dashboard needs the real score via the new `/api/v1/score` endpoint (migration step 2).
5. **localStorage-backed screens** (dashboard layout `maal.dashboard.v2`, debt-payoff, tax-optimizer)
   — fine for ephemeral UI state, but their financial *inputs* should read the user's real data.
6. **Security posture:** the `_authenticated` route guard checks the real session via `/api/me`, but
   the SPA shell is still served `200` to anyone (client-side redirect only). Data is protected
   server-side by `/api/v1` `user_id` scoping, so this is not a data-leak — but a server-side gate on
   `/app/*` (redirect to `/login` if no session) would be cleaner. Migration step 6.

## Recommended build order (feeds migration steps 2–7)
1. `GET /api/v1/score` (real Maal Score + `financial_scores` history) — **highest value, unblocks the
   dashboard hero.** (migration step 2)
2. `GET/PATCH /api/v1/profile` over `db/profiles.js` — unblocks onboarding, portfolio-plan, and the
   calculators' real inputs. Fold `preferences` into this.
3. Dashboard tiles: real `net_worth_snapshots` (step 3).
4. Replace `lib/report.functions.ts` Lovable call with `/api/v1/advisor/message` (quick, compliance).
5. Vault, Research, Radar `/api/v1` bridges over their existing `db/` modules (step 5).
6. Server-side `/app/*` auth gate (step 6).
7. Retire EJS dashboard (step 7).

**Every new `/api/v1` handler must** check `req.session.userId` and scope by `user_id` in SQL
(CLAUDE.md IDOR rule), and any financial-calc/data-mapping logic needs a deterministic test in
`test/` before merge.
