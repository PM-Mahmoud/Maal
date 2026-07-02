# Maal — Architecture

One page. Written by a human, not an agent. This is what stops an agent from "helpfully"
restructuring the auth model or the Basiq flow because it looked inefficient — read this
before touching auth, session, or Basiq code.

## Stack (actual, not aspirational)

Node.js + Express + EJS server-rendered dashboard, a small React/Vite SPA mounted at `/app`
(built to `public/app/`), PostgreSQL on Neon accessed via a single shared `pg.Pool`
(`db/pool.js`, `max: 8`). No Supabase, no Next.js, no ORM — plain SQL in `db/*.js` query
modules. Sessions via `express-session` + `connect-pg-simple` (Postgres-backed, table
`session`). Hosting on Render.

## Auth model

- Password auth: bcrypt (cost 12) via `routes/api.js` / `routes/auth.js`. Google OAuth via
  `routes/oauth.js`.
- Every login path (password, OTP verify, Google callback) calls
  `req.session.regenerate()` before writing `req.session.userId` — this prevents session
  fixation. If you add a new login path, it must do the same.
- Failed-login lockout: `users.locked_until` + `incrementFailedAttempts` (see `db/users.js`).
  OTP brute-force: `users.otp_attempts` / `otp_locked_until`.
- 2FA: `users.two_factor_enabled` gates a 6-digit email OTP at login.
- **No RLS.** Neon/Postgres here is accessed through a plain connection pool with no
  row-level-security policies. Every per-user table (`linked_accounts`, `transactions`,
  `goals`, `vault_files`, `advisor_sessions`, `net_worth_snapshots`, etc.) enforces ownership
  by including `WHERE user_id = $N` in the query itself — see `db/advisor.js` `getMessages()`
  for the reference pattern (fetch is scoped by both `id` and `user_id`, returns null/404 on
  mismatch rather than leaking existence). A query missing that clause is an IDOR bug.

## Basiq (CDR / open banking) data flow

Basiq is Maal's Consumer Data Right intermediary — it's the only path by which Maal ever
touches a user's real bank data. `services/basiq.js` wraps the Basiq v3 REST API (plain
`fetch`, no SDK); `routes/basiq.js` orchestrates the flow, mounted at `/basiq`.

**This is a pull model, not a webhook.** There is no Basiq webhook receiver in this codebase.
The flow is entirely user-initiated:

```
User clicks "Connect a bank" (dashboard/transactions)
  -> GET /basiq/connect
       -> ensureBasiqUser(): creates a Basiq user (server-side, SERVER_ACCESS token)
          the first time, stores basiq_user_id on users
       -> getConsentUrl(): mints a short-lived CLIENT_ACCESS token, builds the
          Basiq-hosted consent UI URL, redirects the browser there
User picks their bank + approves consent entirely inside Basiq's hosted UI
  (Basiq does NOT redirect back automatically)
User clicks "Sync now" on /dashboard/transactions
  -> GET /basiq/sync (same code path as /basiq/callback)
       -> syncAccountsToDb(): getAccounts() from Basiq, delete previously-synced
          `basiq:*` rows in linked_accounts, insert fresh rows; getTransactions()
          from Basiq, upsert into transactions (ON CONFLICT basiq_id)
```

Consent state itself lives in Basiq's system, not in a local `consents` table — Maal only
stores the resulting `basiq_user_id` link (`users.basiq_user_id`) and the synced
account/transaction rows. There is no local consent-lifecycle state machine to reason about;
the trust boundary is "does Basiq still return data for this basiq_user_id."

**Server-to-server token** (`getServerToken()`) is cached ~50 min and used for all
account/transaction reads. **Client token** (`getClientToken()`) is short-lived and scoped to
one Basiq user, used only to build the consent URL — it is never persisted.

Deterministic parts of this flow (account/transaction field mapping — balance rounding,
institution name cleanup, transaction description fallback, amount coercion) are extracted
into `lib/basiq-mapping.js` and covered by `test/basiq-sync.test.js`. See
`specs/basiq-sync.md` for the contract those tests check against.

## Where Azure OpenAI sits

`services/advisor.js` — financial education chat only. It is never in the Basiq
data-sync path and never in the money-movement path (there is no money movement; Maal is
read-only against bank data and does not initiate transfers). RAG retrieval
(`lib/rag.js` + `knowledge_chunks`), prompt-injection guards, and `<user_preferences>` /
`<document>` XML delimiters live in `services/advisor.js` and `routes/dashboard.js`
`/ask/message` — see `CLAUDE.md` "Key architecture" for the full breakdown.

## Billing

Stripe Checkout (`routes/billing.js`), test mode by default. Webhook uses
`express.raw({ type: 'application/json' })` + `stripe.webhooks.constructEvent()` — this is
the one place a raw (non-JSON-parsed) body is required; do not wrap it in the global
`express.json()` middleware.
