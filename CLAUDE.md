## What this app does

Maal helps everyday Australians understand and track their finances, from spending and goals to net worth, tax, super and retirement. The default approach is profit-based. The advisor can explain existing interest-bearing debts and their costs, while recommendations avoid taking on new interest-bearing products. Partner products are display and link-out only.

Maal Membership is the single plan for sale at AUD $4.99 for the first year, then $49.99 per year. A 14-day trial provides member access without a card. Existing Pro and Max members retain their plans. Pricing and trial logic live in `lib/membership.js`.

Keep the mandatory disclaimer on every page. “Maal does not provide financial advice. Any information provided by Maal is for educational purposes only. You should do your own research. Investing is risky and you can lose all of your money.”

## Stack and entry points

- `client/src/` contains the React app, with TanStack Router file routes under `routes/_authenticated/`. Vite writes the bundle to `public/app/`. Express uses the generated route manifest to serve known routes and return 404s for unknown ones.
- `server.js` mounts Express routes and redirects legacy `/dashboard/*` URLs to the React app. Public and legacy EJS templates are in `views/`.
- `routes/api.js` serves the client API. Register dedicated endpoints above the generic `/v1/:table` handlers. Auth uses an Express session stored in PostgreSQL through `connect-pg-simple`.
- `db/` contains PostgreSQL queries. `lib/` and `shared/` contain domain logic. `services/` contains integration and orchestration code. `migrations/` contains timestamped migrations.
- Read the relevant feature spec and `CONTEXT.md` before changing domain logic. See [DEPLOY.md](DEPLOY.md) for operational commands and environment variable names.

## Design system and navigation

- The redesigned surfaces use Lora headings, Inter body text, a light page background of `#F8F9F6`, white cards and black primary buttons. Use the existing component styles and the light and dark tokens in `client/src/globals.css`.
- `client/src/components/maal/nav/sections.ts` defines Track, Services, Calculators and Account. Track sub-pages appear as section tabs. Spending sub-pages use the non-nested `app.spending_.<page>.tsx` route convention.
- Use `shared/category-colours.mjs` for category charts and `shared/transaction-splits.mjs` for effective spending rows. Use `InstitutionLogo` for supported Australian banks.
- Run `node scripts/preview-static.js` for a database-free preview. Check changed interfaces at 1440px and 375px in light and dark mode.

## Linear and pull requests

- Pick issues marked `agent-ready` from the Hellomaal team. Issues marked `needs-Mahmoud` await Mahmoud’s decision. The [Website redesign: 85 flows project](https://linear.app/hellomaal/project/website-redesign-85-flows-5a70bee25fcf) tracks redesign progress.
- Create one `hel-<number>-<slug>` branch per issue from the latest `origin/main`. Open a PR with `Fixes HEL-<number>` and comment on the Linear issue with verification and the PR link. Mahmoud approves merges to `main`.
- In a fresh worktree, install dependencies with `npm ci --ignore-scripts` at the repo root and in `client/`. Run `npm test`, `node scripts/render-test.js` and `npx tsc --noEmit -p client`. Until HEL-56 is resolved, copy the ignored `client/tsconfig.json` from the main checkout.
- After the final client change, run `cd client && npm run build`. Commit the generated `public/app/` files, including `route-manifest.json`, in a separate commit. After a bundle conflict, rebase on `main` and rebuild the bundle.
- Use Australian English and Australian context. Keep partner and reference app names out of public work. The private Maal Operating Manual holds account and cost information.

## Architecture notes
- **Maal Score**: `lib/maal-score.js` — single 0–100 composite (5 pillars: savings 25%, debt 25% w/ HECS at 30% weight, super-vs-ASFA-curve 20%, wealth trajectory 15%, protection 15%). Computed by `POST /api/v1/score/compute` in `routes/api.js`
- **Model gateway**: `services/gateway.js` — ALL LLM calls route through it by ROLE: `reasoner` (synthesis; Azure first, then a configured OpenAI-compatible endpoint, then Groq), `cheap` (extraction/classification; Groq-first → Azure cheap), `verifier` (Anthropic Claude via **ANTHROPIC_API_KEY** + optional ANTHROPIC_MODEL, default claude-sonnet-5). Every role degrades gracefully when its key is missing (no verifier → verify pass skipped with a log line). `GATEWAY_BASE_URL`+`GATEWAY_API_KEY`(+GATEWAY_MODEL[_ROLE]) reroutes every role to a LiteLLM-style proxy (graduation path). Verify-and-revise: `gateway.verifyAndRevise()` runs a blocking Claude critique (narrow rubric: math, AU constants, claims-vs-user-data — never style) with ONE reasoner revision round, then ships regardless; wired into `advisor.chat()`. Deterministic tests: `test/gateway.test.js` (stubbed fetch)
- **AU constants (FY-keyed, 2026-07-12)**: `lib/au-constants.js` — CONSTANT_SETS keyed by financial year ('2025-26', '2026-27', …), each with effectiveFrom/reviewed/sources; date-based `getConstants()` switches automatically on 1 July, so legislated future changes are entered in advance. AUTHORITATIVE over model knowledge/RAG/web (enforced by the verifier). `lib/tax.js` consumes it (no duplicated brackets). **ANNUAL REVIEW CONTRACT**: `test/au-constants.test.js` FAILS every July until the new FY entry is human-reviewed against the ATO. Monthly drift-check: GET /internal/constants/drift?token=RADAR_CRON_SECRET (`services/constants-audit.js`, Exa search over ato.gov.au + cheap model, propose-only — never auto-applies)
- **Transactions depth**: 18-group AU category taxonomy in `lib/transaction-categories.js` (+ keyword `autoCategorize()` fallback). Rules engine + subscriptions detection are PURE in `services/transaction-rules.js` (`matchRule`/`computeAssignments`/`detectSubscriptions` — deterministic-tested in `test/transaction-rules.test.js`). Categories are stored in a SEPARATE `transaction_categories` table (FK to transactions) so the **protected `transactions` table is never altered**; rules in `transaction_rules` (migration 1752600000000, both additive/FK-only). Endpoints (all before `/v1/:table`): GET `/v1/transaction-categories`, dedicated GET `/v1/transactions` (joins category + auto-category fallback for display), GET `/v1/transactions/subscriptions`, PATCH `/v1/transactions/:id/category`, GET/POST/DELETE `/v1/transaction-rules`, POST `/v1/transaction-rules/apply`. Client: transactions page All/Subscriptions toggle + `RulesModal.tsx` (create rules, apply-to-all). `db/transactions.js` gains the category/rules helpers
- **Advisor memory + custom instructions**: `services/advisor-memory.js` synthesizes a per-user markdown memory doc (`advisor_memory` table, migration 1752500000000, `db/advisor-memory.js`) via the **cheap** role on a DEFERRED debounce (`setImmediate` after the reply, `MERGE_DEBOUNCE_MS` default 10min) — never per turn, never blocking. `redactSensitive()` strips account numbers/BSBs/$balances before storage (belt over the prompt rule). Memory + user-authored **custom instructions** (stored in `user_profiles.onboarding_data.custom_instructions`, 500-char cap) are injected into `buildSystemPrompt` via `extra.memory`/`extra.customInstructions` (each in an XML wrapper, subordinate to guardrails/constants). User-steerable: GET/PUT/DELETE `/api/v1/advisor/memory` + `MemoryPanel.tsx` (view/edit instructions, inspect/edit/clear memory). Composer niceties on the thread page: stop button (AbortController → `/message` signal), draft autosave (localStorage per thread), download conversation, voice input (Web Speech API). Tests: `test/advisor-memory.test.js`
- **Advisor chat**: `services/advisor.js` — prompt building + orchestration on top of the gateway (Azure endpoint schemes: classic `*.openai.azure.com` and Foundry v1 `*.services.ai.azure.com` both supported in the gateway). Exposes `complete(messages, opts)` (opts.role: reasoner/cheap; legacy opts.tier maps to reasoner) reused by research/radar; `extractFigures` uses the cheap role. `chat()` = text-only (SMS/email), `chatRich()` = web (generative UI). Endpoint: POST /api/v1/advisor/message. Education-only guardrails + profile (incl. onboarding_data preferences) + Maal Score in system prompt
- **Agentic advisor / generative UI**: `services/advisor-widgets.js` — the reasoner may emit fenced `maal-widget {"source":...}` + `maal-followups [...]` directives; `advisor.chatRich()` parses them out, fills each widget's data SERVER-SIDE from the user's real data (never the model — no fabricated figures) via a `WIDGET_SOURCES` whitelist (networth_composition/net_worth_trend/cashflow_summary/score_breakdown/goals_summary), returns `{reply, widgets, followUps, citations}`. **Citations are internal-only** (user's portfolio/transactions/goals/Vault doc — NEVER web/RAG, per user directive). **Add to Dashboard** persists only the widget SOURCE to `user_widgets` (`db/widgets.js`, migration 1752400000000); GET /api/v1/widgets re-renders saved widgets LIVE from current data (`renderSaved`). Client: `WidgetRenderer.tsx` (monochrome donut/line/table/stat-cards), advisor thread renders widgets+chips+cites, `SavedWidgets.tsx` under the dashboard. RAG chunks are explicitly subordinate to FY constants + app data in the prompt. Tests: `test/advisor-widgets.test.js`
- **Diagnostics**: GET /health returns boolean integration flags (basiq/advisor/azure/stripe) — first stop when an env var "isn't working"
- **Gotcha**: Postgres BIGINT columns return as strings — always `Number()` profile money fields before arithmetic (string concat bug bit us once)

- **Membership and metering** use `routes/billing.js`, `lib/membership.js`, `lib/plan-limits.js` and `db/usage.js`. The plan limits module is authoritative for member and legacy plan quotas.
- **Research and radar** use Finnhub for market data and Exa (`EXA_API_KEY`) for web grounding. `services/grounding.js` handles search. Missing Exa credentials leave the market data path available.
- **Basiq (CDR open banking)** connects via hosted consent and processes imports through the worker declared in `render.yaml`.
- **Vault** uses PostgreSQL by default and supports object storage. See [DEPLOY.md](DEPLOY.md#object-storage-for-vault-cloudflare-r2--s3).
- **Transactional email** uses Resend (`RESEND_API_KEY` and `EMAIL_FROM`).

## Engineering rules

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
- Never alter `users`, `linked_accounts`, `transactions` or `session`. Store new data in additive side tables and flag migrations for human review in the PR.
- Financial calculations and Basiq data-mapping logic (balance rounding, transaction field
  coercion, score/tax/projection math) must be covered by a deterministic test in `test/`
  before merge — never "looks right" verification alone.
- Every query against a
  per-user table (`linked_accounts`, `transactions`, `goals`, `vault_files`,
  `advisor_sessions`, etc.) must filter by `user_id`/`req.session.userId` in the SQL itself
  (see `db/advisor.js` `getMessages` for the pattern). A missing `WHERE user_id = $N` is an
  IDOR bug, not a style issue.

- On a failing test: read the error, retry the fix up to 3 times in the same session, then
  stop and report to the human rather than guessing further.
- Use Basiq sandbox and Stripe test credentials for development.
