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

## Recent changes
- 2026-05-23: Portfolio recommendation engine at /dashboard/portfolio — 7-field intake form, allocation engine (age/risk/debt/super decision tree), SVG donut chart, fund tables with HLAL/SPUS/VESG/ETHI tickers, "Why this portfolio" explanation; routes/portfolio.js, views/dashboard-portfolio.ejs
- 2026-05-23: Recommended Tools feature — /dashboard/tools, recommended_tools table (30 tools), tier+profile-aware filtering, editorial disclaimer; routes/tools.js, db/recommended-tools.js, views/dashboard-tools.ejs, migration 1748004000000
- 2026-05-23: Full auth system — login/signup/forgot-password/reset/verify, bcrypt passwords, Postgres sessions, protected dashboard with 5 sub-pages
- 2026-05-23: Financial Health Score calculator at /score — 4-step form, 0-100 score, gauge, recommendations + waitlist CTA
- 2026-05-23: Added routes/score.js, db/score.js, lib/score-engine.js, views/score.ejs; migration 1748002000000
- 2026-05-23: Full onboarding wizard (7-step progressive disclosure) at /onboarding