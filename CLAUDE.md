## What this app does
Mizan is a landing page and waitlist for an AI-powered financial clarity platform built for Australian health professionals. It delivers a Financial Health Score, Portfolio Halal/ESG Compliance Score, and a personalised action plan — no human advisor needed. Serves both Muslim professionals (halal portfolio) and non-Muslim professionals (ESG/ethical) from one product.

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
- `financial_scores` — score history (financial_health, super_health, ethical_score)
- `recommendations` — personalised action items with priority and status
- `linked_accounts` — manually linked financial institutions
- `waitlist_emails` — email waitlist signups
- `score_submissions` — anonymous Financial Health Score calculator submissions
- `onboarding_sessions` / `onboarding_responses` — 7-step onboarding wizard state
- `recommended_tools` — curated third-party platform catalogue (category, region, tier_access, halal_relevant)

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
Mizan is "the all-in-one for ethical investing" — a CFO-level advisor (AI never overemphasised in UI copy) that reads statements, bank accounts and transactions so users understand their financial situation. Pricing: Free $0 / Pro $20/mo / Max $200/mo (AUD). Mandatory disclaimer on every page: "Mizan does not provide financial advice. Any information provided by Mizan is for educational purposes only. You should do your own research. Investing is risky and you can lose all of your money."

## Design system
- Light theme default, dark via `html[data-theme="dark"]` (localStorage key `mizan-theme`)
- `public/css/app.css` — dashboard design system + legacy class compatibility; `public/css/theme.css` — landing/auth (same tokens)
- **Minimal flat language (2026-06, tokorocapital.com-inspired)**: single font Hanken Grotesk (300–700; big headlines at weight 300), flat monochrome green palette — forest accent #115832, racing-green text #1F2722, cool-grey surfaces #F3F3F1, pale-green tints #E3F0E8/#F1F8F3; dark theme = racing-green black #101411 with park-green accent #AED4AF. Hairline 1px borders, NO shadows (--shadow:none; --shadow-lg only for modals), pill buttons, uppercase letter-spaced micro-labels (.panel-title, nav links, .side-group). Both stylesheets: tokens at top + "Tokoro minimal pass" override layer at bottom — put new visual overrides in that layer
- `scripts/preview-static.js` (+ root `.claude/launch.json` "mizan-preview", port 4173) serves key pages with mock data and NO database — use for visual review
- App shell: `views/app-layout.ejs` (sidebar, mobile hamburger topbar, floating chat widget, theme toggle, disclaimer footer). Landing partials in `views/partials/`. All dashboard routers set `res.locals.layout = 'app-layout'`
- `public/js/app.js` — all client interactivity: generic `.tabs` toggling, modal/toast factories (`data-add-asset`, `data-demo-soon` attrs), sparkline drawing from `window.MIZAN_SNAPSHOTS`, advisor chat sessions, goals/radars/research/uploads (localStorage), Basiq tile handling (`data-basiq-live` → /basiq/connect, else demo modal)

## Key architecture (2026-06)
- **Mizan Score**: `lib/mizan-score.js` — single 0–100 composite (5 pillars: savings 25%, debt 25% w/ HECS at 30% weight, super-vs-ASFA-curve 20%, wealth trajectory 15%, protection 15%). Computed in /dashboard route, shown as hero ring + pillar bars
- **Net worth charts**: `net_worth_snapshots` table (daily upsert per user on dashboard load, `db/snapshots.js`), client draws sparklines + 1M/6M/YTD/All filtering
- **Advisor chat**: `services/advisor.js` — provider-agnostic OpenAI SDK. Precedence: AI_API_KEY+AI_BASE_URL+AI_MODEL > GROQ_API_KEY (default: Groq, llama-3.3-70b-versatile, US servers — chosen to avoid China routing for AU regulatory comfort) > DEEPSEEK_API_KEY. Endpoint: POST /dashboard/ask/message. Education-only guardrails + profile + Mizan Score in system prompt
- **Basiq (CDR open banking)**: `services/basiq.js` (v3 API, server/client tokens, hosted consent UI) + `routes/basiq.js` at /basiq (connect/callback/sync). BASIQ_API_KEY env (free sandbox: dashboard.basiq.io, test bank "Hooli Bank"). Note: consent UI does NOT redirect back — users must press "Sync now" on /dashboard/transactions. users.basiq_user_id column links accounts
- **Billing**: `routes/billing.js` at /billing — Stripe Checkout (test mode, AUD subscriptions) with STRIPE_SECRET_KEY; demo mode without key. Plan persisted to users.plan (free/pro/max), shown in Settings with upgrade/downgrade
- **Diagnostics**: GET /health returns boolean integration flags (basiq/advisor/stripe) — first stop when an env var "isn't working"
- **Gotcha**: Postgres BIGINT columns return as strings — always `Number()` profile money fields before arithmetic (string concat bug bit us once)
- New dashboard pages: /dashboard/{ask,research,radar,assets,vault,transactions,goals,settings} + legacy {scores,recommendations,accounts,profile,history,portfolio,tools}
- Migration `1749600000000_snapshots_plan_basiq.js` adds snapshots table + users.plan + users.basiq_user_id

## Env vars (Render)
DATABASE_URL, SESSION_SECRET, BASE_URL, RESEND_API_KEY/EMAIL_FROM, ADMIN_PASSWORD, GOOGLE_CLIENT_ID/SECRET, TWILIO_*, plus integrations: BASIQ_API_KEY, GROQ_API_KEY (or AI_API_KEY/AI_BASE_URL/AI_MODEL), STRIPE_SECRET_KEY

## Key architecture (2026-06-12 additions)
- **Tax Impact**: `lib/tax.js` — FY25-26 resident brackets + 2% Medicare + new marginal HECS (15c $67k–$125k, 17c above). Widget on overview; indicative only
- **Roadmap voting**: `routes/roadmap.js` at /dashboard/roadmap + `db/roadmap.js` — roadmap_items/roadmap_votes tables, one ±1 vote per user (same vote toggles off), seeded with 4 items
- **Feedback**: sidebar modal → POST /feedback → feedback table (`db/feedback.js`)
- **Privacy mode**: eye button in sidebar bottom bar → `html[data-privacy="on"]` blurs .stat-value/.row-val/.sparkline (localStorage `mizan-privacy`)
- **2FA**: Settings toggle → users.two_factor_enabled → login emails a 6-digit code via existing OTP/verify-email machinery
- **Cash & runway**: user_profiles.cash_savings + monthly_expenses (migration 1749710000000); Total Cash hero stat, live Cash Runway widget; both editable via the asset modal whitelist (ASSET_FIELDS)
- **Testing**: `node scripts/render-test.js` renders every EJS view with mock locals (no DB needed) — run before committing view/route changes. Local node lives at `~/.local/node/bin/node` (not on PATH)

## Recent changes
- 2026-06-12: Bug sweep (Basiq findUserById columns, reset-password locals, missing error view, missing /api/account/delete, login lockout column) + spec features (tax impact, movers placeholder, roadmap voting, feedback, privacy mode, email 2FA, cash/runway) + UI polish layer + CFO-language login page
- 2026-06-11: Full Silvia-inspired redesign (app shell + landing + auth), Mizan Score engine, real net-worth charts, provider-agnostic advisor chat (Groq default), Basiq sandbox flow, Stripe checkout + persisted plans, mobile nav, favicon/OG images, all-buttons-functional pass
- 2026-05-23: Portfolio recommendation engine at /dashboard/portfolio — 7-field intake form, allocation engine (age/risk/debt/super decision tree), SVG donut chart, fund tables with HLAL/SPUS/VESG/ETHI tickers, "Why this portfolio" explanation; routes/portfolio.js, views/dashboard-portfolio.ejs
- 2026-05-23: Recommended Tools feature — /dashboard/tools, recommended_tools table (30 tools), tier+profile-aware filtering, editorial disclaimer; routes/tools.js, db/recommended-tools.js, views/dashboard-tools.ejs, migration 1748004000000
- 2026-05-23: Full auth system — login/signup/forgot-password/reset/verify, bcrypt passwords, Postgres sessions, protected dashboard with 5 sub-pages
- 2026-05-23: Financial Health Score calculator at /score — 4-step form, 0-100 score, gauge, recommendations + waitlist CTA
- 2026-05-23: Added routes/score.js, db/score.js, lib/score-engine.js, views/score.ejs; migration 1748002000000
- 2026-05-23: Full onboarding wizard (7-step progressive disclosure) at /onboarding