## What this app does
Maal is a landing page and waitlist for an AI-powered financial clarity and wealth-advisory platform built for everyday Australians — anyone who wants to understand their finances, grow their wealth, and plan with confidence. It delivers a Financial Health Score, a personalised action plan, and tools to track net worth, optimise tax & super, manage debt, and plan for retirement — no human advisor needed. Career-agnostic and values-agnostic, for all Australians.

## Stack
Node.js + Express + EJS templates + PostgreSQL (Neon) + Tailwind-style custom CSS

## Directory map
- `views/` — EJS templates (layout.ejs + partials/ + auth-*.ejs + dashboard-*.ejs)
- `public/css/` — Custom CSS (theme.css)
- `routes/` — Express route handlers (auth.js, dashboard.js, reset.js, waitlist.js, onboarding.js, score.js, tools.js, portfolio.js)
- `db/` — Database query functions (auth.js, users.js, profiles.js, scores.js, recommendations.js, linked_accounts.js, onboarding.js, waitlist.js, score.js, recommended-tools.js)
- `services/` — External integrations (email.js)
- `lib/` — Shared utilities (landing-context.js, score-engine.js)
- `migrations/` — JS migration files, timestamped, run by migrate.js on deploy

## Database
- `users` — authenticated user accounts (email, password_hash, provider, verify_token, reset_token)
- `session` — express-session storage via connect-pg-simple
- `user_profiles` — onboarding data and financial preferences per user
- `financial_scores` — score history (financial_health, super_health, ethical_score [legacy column retained for non-destructive compat; now stores a neutral portfolio-diversification signal and is not surfaced in the UI])
- `recommendations` — personalised action items with priority and status
- `linked_accounts` — manually linked financial institutions
- `waitlist_emails` — email waitlist signups
- `score_submissions` — anonymous Financial Health Score calculator submissions
- `onboarding_sessions` / `onboarding_responses` — 7-step onboarding wizard state
- `recommended_tools` — curated third-party platform catalogue (category, region, tier_access, halal_relevant [legacy column retained; no longer used for filtering or display])

## External integrations
- Polsia Email Proxy (`POLSIA_EMAIL_PROXY_URL`) — sends waitlist confirmation, verification, and reset emails via Bearer `POLSIA_API_KEY`
- Polsia Analytics — beacon pixel injected via `buildAnalyticsSnippet()` in lib/landing-context.js
- Neon PostgreSQL — `DATABASE_URL` env var, SSL enforced in production

## Session / Auth
- express-session with connect-pg-simple (Postgres store) — 30-day sessions
- `SESSION_SECRET` env var required in production
- Routes: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`
- All `/dashboard/*` routes require authenticated session (redirect to `/login`)
- Dashboard at `/dashboard` with sub-pages: scores, recommendations, accounts, profile, history

## Positioning
Maal is "the all-in-one for everyday Australians" — a CFO-level advisor (AI never overemphasised in UI copy) that reads statements, bank accounts and transactions so users understand their financial situation, grow their wealth, and plan with confidence. Career-agnostic and values-agnostic. Pricing: Free $0 / Pro $20/mo / Max $200/mo (AUD). Mandatory disclaimer on every page: "Maal does not provide financial advice. Any information provided by Maal is for educational purposes only. You should do your own research. Investing is risky and you can lose all of your money."

## Design system
- Light theme default, dark via `html[data-theme="dark"]` (localStorage key `maal-theme`)
- `public/css/app.css` — dashboard design system + legacy class compatibility; `public/css/theme.css` — landing/auth (same tokens)
- **Design language (2026-06-14, matches sahha.ai)**: font **Geist** (300–700; headings BOLD 700, tight -0.03em tracking). **Monochrome palette** — near-white bg #FBFBFB, white surface, #F4F4F5 surface-2, near-black ink `--fg`/`--ink` #0E0E10, grey muted #6B6F76, hairline border #E8E8EA. **Mint-teal accent** `--accent` #12B5A6 (UI) + `--accent-bar` #5FE3D1 (the signature 3px fixed top bar via `body::before`), accent-soft #DEF7F4. `--gold` #C2701E (warm, sparse). Dark = #0A0A0B bg, white text, teal #2DD4C4, `--ink` inverts to white. **Primary buttons are BLACK** (ink bg, white text; `.btn-accent`/`.nav-cta`/`.hero-cta`), rounded-rect 8px (NOT pills); secondary = outline. **Charts/bars are monochrome ink** (sparklines, ring, .bar-fill, trend chart line = `--fg`), teal reserved for accent bar/focus/chips/links/up-deltas (down=red). Nav-active = grey fill + 2px teal left bar. Both stylesheets: tokens + "Sahha pass" override layer at bottom — put new visual overrides there. Login (`auth-login.ejs`) is a Sahha split: left form (no card) + empty right pane with seam
- `scripts/preview-static.js` (+ root `.claude/launch.json` "maal-preview", port 4173) serves key pages with mock data and NO database — use for visual review
- App shell: `views/app-layout.ejs` (sidebar, mobile hamburger topbar, floating chat widget, theme toggle, disclaimer footer). Landing partials in `views/partials/`. All dashboard routers set `res.locals.layout = 'app-layout'`
- `public/js/app.js` — all client interactivity: generic `.tabs` toggling, modal/toast factories (`data-add-asset`, `data-demo-soon` attrs), sparkline drawing from `window.MAAL_SNAPSHOTS`, advisor chat sessions, goals/radars/research/uploads (localStorage), Basiq tile handling (`data-basiq-live` → /basiq/connect, else demo modal)

## Key architecture (2026-06)
- **Maal Score**: `lib/maal-score.js` — single 0–100 composite (5 pillars: savings 25%, debt 25% w/ HECS at 30% weight, super-vs-ASFA-curve 20%, wealth trajectory 15%, protection 15%). Computed in /dashboard route, shown as hero ring + pillar bars
- **Net worth charts + tile trends**: `net_worth_snapshots` table (daily upsert per user on dashboard load, `db/snapshots.js`; columns incl. cash_balance from migration 1749770000000). Client (`app.js` §2) draws 4 sparklines (networth/invest/cash/debts — Total Cash charts cash, NOT super) + **1M/3M/1Y/All** range filtering that updates each tile's $ + % delta (debts inverted: down=good). **Click a stat tile** → `openTrendModal()`: large area chart for that metric over the range + Opening/Closing/Change + Money in/out from `window.MAAL_TXNS` (signed `transactions`, `db/transactions.getTxnsSince`, passed as `chartTxns`). Trend modal has its own range tabs.
- **Advisor chat**: `services/advisor.js` — provider-agnostic. Precedence: **Azure OpenAI** (AZURE_OPENAI_ENDPOINT/_API_KEY/_DEPLOYMENT/_API_VERSION — same scheme as sibling promptdoc; supports classic *.openai.azure.com and Foundry v1 *.services.ai.azure.com surfaces) > AI_API_KEY+AI_BASE_URL+AI_MODEL > GROQ_API_KEY > DEEPSEEK_API_KEY. Exposes `complete(messages, opts)` reused by research/radar. Endpoint: POST /dashboard/ask/message. Education-only guardrails + profile (incl. onboarding_data preferences) + Maal Score in system prompt
- **Basiq (CDR open banking)**: `services/basiq.js` (v3 API, server/client tokens, hosted consent UI) + `routes/basiq.js` at /basiq (connect/callback/sync). BASIQ_API_KEY env (free sandbox: dashboard.basiq.io, test bank "Hooli Bank"). Note: consent UI does NOT redirect back — users must press "Sync now" on /dashboard/transactions. users.basiq_user_id column links accounts
- **Billing**: `routes/billing.js` at /billing — Stripe Checkout (test mode, AUD subscriptions) with STRIPE_SECRET_KEY; demo mode without key. Plan persisted to users.plan (free/pro/max), shown in Settings with upgrade/downgrade
- **Real-time data (2026-06-14)**: `services/marketdata.js` (Finnhub — quotes/company-news/market-news/symbol-search, FINNHUB_API_KEY, short in-mem cache) + `services/grounding.js` (Bing web/news search, BING_SEARCH_KEY/_ENDPOINT, v7 REST shape). Both pluggable — degrade to []/null with no key. Dashboard Top/Bottom Movers uses Finnhub on a watchlist (MAAL_WATCHLIST env, default US large-caps)
- **Research (real)**: `services/research.js` orchestrates Finnhub market news + Bing grounding → Azure synthesis with cited sources. `db/research.js` + research_reports table. Endpoints in dashboard.js: POST /dashboard/research/run (synchronous, ~secs), GET /dashboard/research/:id. View renders history + report inline
- **Radar (real)**: `services/radar.js` evaluates each watch (Finnhub quotes/news + Bing news → Azure ALERT/OK verdict → email/SMS via existing services). `db/radar.js` + radars/radar_events tables. CRUD in dashboard.js (POST /dashboard/radar, DELETE /:id, POST /:id/run). Scheduled sweep: GET /internal/radar/run?token=RADAR_CRON_SECRET (call from external cron e.g. cron-job.org), evaluates radars whose frequency interval elapsed. extractSymbols() pulls tickers from the prompt
- **Goals/Vault/Settings prefs now real (2026-06-14)**: `db/goals.js` + goals table (CRUD in dashboard.js, server-rendered cards). `db/vault.js` + vault_files table stores actual file bytes in Postgres **bytea** (multer memoryStorage, 10MB cap; kind='vault'|'statement'); upload POST /dashboard/vault/upload, download GET /dashboard/vault/file/:id, used by Vault page + Transactions statement dropzone. Notification toggles persist to users.notification_prefs JSONB (POST /dashboard/settings/notifications). Migration 1749760000000. **No more localStorage-only features remain.**
- **Diagnostics**: GET /health returns boolean integration flags (basiq/advisor/azure/stripe) — first stop when an env var "isn't working"
- **Gotcha**: Postgres BIGINT columns return as strings — always `Number()` profile money fields before arithmetic (string concat bug bit us once)
- New dashboard pages: /dashboard/{ask,research,radar,assets,vault,transactions,goals,settings} + legacy {scores,recommendations,accounts,profile,history,portfolio,tools}
- Migration `1749600000000_snapshots_plan_basiq.js` adds snapshots table + users.plan + users.basiq_user_id

## Agentic engineering hard rules (2026-07-02)

Maal touches consumer financial data through Basiq, a CDR (Consumer Data Right) intermediary.
These rules exist because "looks right" is not sufficient assurance for code that touches
that data path. They apply to every agent session, not just this one.

**Never violate:**
- Never log, print, or commit a real `BASIQ_API_KEY`, Basiq access/refresh token, Azure OpenAI
  key, Stripe secret key, `ISAACUS_API_KEY`, or any user PII (email, balance, transaction
  description) to console output that could land in a committed log file.
- Never call the Basiq API, Stripe, Azure OpenAI, or Isaacus against production credentials
  from a dev/test branch. `services/basiq.js`/`services/isaacus.js` read their API keys from
  env only — never hardcode.
- Treat all data returned by Basiq (`services/basiq.js` `getAccounts`/`getTransactions`) as PII
  until it's been through the existing mapping/sanitisation layer.
- Never modify a migration that touches `users`, `linked_accounts`, `transactions`, or
  `session` without flagging it for human review — do not auto-apply to production.
- Financial calculations and Basiq data-mapping logic (balance rounding, transaction field
  coercion, score/tax/projection math) must be covered by a deterministic test in `test/`
  before merge — never "looks right" verification alone.
- Ownership checks replace RLS here: Maal has no Supabase/RLS layer — every query against a
  per-user table (`linked_accounts`, `transactions`, `goals`, `vault_files`,
  `advisor_sessions`, etc.) must filter by `user_id`/`req.session.userId` in the SQL itself
  (see `db/advisor.js` `getMessages` for the pattern). A missing `WHERE user_id = $N` is an
  IDOR bug, not a style issue.

**Workflow:**
- Read `/specs/<feature>.md` before implementing a feature that has one.
- Run `npm test` before opening a PR that touches `lib/`, `db/transactions.js`,
  `db/linked_accounts.js`, or `services/basiq.js`.
- On a failing test: read the error, retry the fix up to 3 times in the same session, then
  stop and report to the human rather than guessing further.
- Basiq/Stripe dev work always targets sandbox credentials — this is enforced by the
  pre-commit hook in `.claude/hooks/pre-commit`, not just convention.

## AI Advisor Upgrade Plan (2026-06-28)

Ordered implementation steps — each builds on the last:

1. **RAG wiring** ✅ — `retrieveAndFormat()` called inside `chat()`, knowledge_chunks already embedded (41 AU financial articles)
2. **Enriched system prompt** ✅ — transactions (30d), goals, net-worth trend (90d), cash runway passed as `extra` to `buildSystemPrompt()`
3. **Injection guardrails** ✅ — pattern check before advisor call; `<user_preferences>` XML wrapper; `<document>` wrapper on vault docs
4. **Server-side conversation persistence** ✅ — `advisor_sessions` + `advisor_messages` tables; `db/advisor.js`; history survives page refresh
5. **Isaacus legal/tax integration** — `services/isaacus.js`. Isaacus (https://isaacus.com) is
   **not** a chat/completion API — every call is extractive/classificatory over text you supply,
   there's no "ask it anything about AU law" endpoint. Current scope (✅ done): when a user asks
   a legal/tax question and has documents in Vault, `/ask/message` uses Isaacus's universal
   classifier to detect legal/tax intent, then extractive Q&A (`kanon-answer-extractor`) to pull
   the literal answer out of their own document text, injected into the main LLM's system prompt
   as `<legal_extraction>` grounding so it can phrase the reply and cite the source. General
   legal/tax questions with no matching Vault document still fall through to the main LLM as
   before — Isaacus can't answer from nothing, it needs a document to extract from. **Not yet
   built:** a curated AU legal/tax reference corpus (ATO guidance, super rules, etc.) in
   `knowledge_chunks` (category `legal`) for questions with no Vault document — needs real
   sourced content, not fabricated, before it can be built. `ISAACUS_API_KEY` env var, `/health`
   check wired.
6. **Tool calling** — `get_score_breakdown`, `get_cashflow_summary`, `get_net_worth_trend`, `calculate_tax_estimate`, `get_goals_summary` via OpenAI function-calling format
7. **SSE streaming** — `POST /dashboard/ask/stream`, `X-Accel-Buffering: no`, client reads token-by-token
8. **Knowledge base gaps** — add AU articles: Centrelink thresholds, FHSSS, salary sacrifice, concessional catch-up, debt recycling
9. **Context summarisation** — auto-compress sessions >20 turns

Env vars needed for full advisor: `AZURE_OPENAI_ENDPOINT/_API_KEY/_DEPLOYMENT/_API_VERSION`, `ISAACUS_API_KEY` (for legal/tax routing), `FINNHUB_API_KEY`, `BING_SEARCH_KEY`

## Env vars (Render)
DATABASE_URL, SESSION_SECRET, BASE_URL, RESEND_API_KEY/EMAIL_FROM, ADMIN_PASSWORD, GOOGLE_CLIENT_ID/SECRET, TWILIO_*, plus integrations: BASIQ_API_KEY, STRIPE_SECRET_KEY; AI: **AZURE_OPENAI_ENDPOINT/_API_KEY/_DEPLOYMENT/_API_VERSION** (preferred) or GROQ_API_KEY or AI_API_KEY/AI_BASE_URL/AI_MODEL; real-time data: FINNHUB_API_KEY, BING_SEARCH_KEY (+ optional BING_SEARCH_ENDPOINT), MAAL_WATCHLIST; radar cron: RADAR_CRON_SECRET; legal AI: ISAACUS_API_KEY

## Key architecture (2026-06-12 additions)
- **Tax Impact**: `lib/tax.js` — FY25-26 resident brackets + 2% Medicare + new marginal HECS (15c $67k–$125k, 17c above). Widget on overview; indicative only
- **Roadmap voting**: `routes/roadmap.js` at /dashboard/roadmap + `db/roadmap.js` — roadmap_items/roadmap_votes tables, one ±1 vote per user (same vote toggles off), seeded with 4 items
- **Feedback**: sidebar modal → POST /feedback → feedback table (`db/feedback.js`)
- **Privacy mode**: eye button in sidebar bottom bar → `html[data-privacy="on"]` blurs .stat-value/.row-val/.sparkline (localStorage `maal-privacy`)
- **2FA**: Settings toggle → users.two_factor_enabled → login emails a 6-digit code via existing OTP/verify-email machinery
- **Cash & runway**: user_profiles.cash_savings + monthly_expenses (migration 1749710000000); Total Cash hero stat, live Cash Runway widget; both editable via the asset modal whitelist (ASSET_FIELDS)
- **Testing**: `node scripts/render-test.js` renders every EJS view with mock locals (no DB needed) — run before committing view/route changes. Local node lives at `~/.local/node/bin/node` (not on PATH)

## Recent changes
- 2026-06-12: Bug sweep (Basiq findUserById columns, reset-password locals, missing error view, missing /api/account/delete, login lockout column) + spec features (tax impact, movers placeholder, roadmap voting, feedback, privacy mode, email 2FA, cash/runway) + UI polish layer + CFO-language login page
- 2026-06-11: Full Silvia-inspired redesign (app shell + landing + auth), Maal Score engine, real net-worth charts, provider-agnostic advisor chat (Groq default), Basiq sandbox flow, Stripe checkout + persisted plans, mobile nav, favicon/OG images, all-buttons-functional pass
- 2026-06-25: Career-agnostic + values-agnostic rebrand — removed all health-professional and halal/ESG/ethical positioning across landing, auth, onboarding, dashboard, advisor/research prompts and knowledge base. Portfolio engine reframed to mainstream risk-based diversified portfolios (Conservative/Balanced/Growth/High Growth) from low-cost AU/global ETFs (VAS, VGS, VDHG, VDCO, VAF, AAA, GOLD); investorType halal/ESG split removed. ethical_score / prefers_halal / prefers_esg / halal_relevant DB columns retained (non-destructive) but no longer surfaced or set from the UI
- 2026-05-23: Portfolio recommendation engine at /dashboard/portfolio — 7-field intake form, allocation engine (age/risk/debt/super decision tree), SVG donut chart, mainstream diversified ETF fund tables, "Why this portfolio" explanation; routes/portfolio.js, views/dashboard-portfolio.ejs
- 2026-05-23: Recommended Tools feature — /dashboard/tools, recommended_tools table (30 tools), tier+profile-aware filtering, editorial disclaimer; routes/tools.js, db/recommended-tools.js, views/dashboard-tools.ejs, migration 1748004000000
- 2026-05-23: Full auth system — login/signup/forgot-password/reset/verify, bcrypt passwords, Postgres sessions, protected dashboard with 5 sub-pages
- 2026-05-23: Financial Health Score calculator at /score — 4-step form, 0-100 score, gauge, recommendations + waitlist CTA
- 2026-05-23: Added routes/score.js, db/score.js, lib/score-engine.js, views/score.ejs; migration 1748002000000
- 2026-05-23: Full onboarding wizard (7-step progressive disclosure) at /onboarding