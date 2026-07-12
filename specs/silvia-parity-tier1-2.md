# Silvia Parity — Tier 1 + Tier 2 build contract

**Status:** agreed 2026-07-12 (grilling session with Mahmoud; every decision below is
user-approved). **Source docs:** `cfosilvia-competitive-teardown-2026-07-09.md` (the 15-item
build plan this scopes), `maal-handoff-2026-07-09.md`.

**Scope:** Tier 1 + Tier 2 of the teardown build plan (items 1–11). **Tier 3 (granular asset
model, vault folders, mobile app, etc.) is explicitly deferred** — do not scope-creep into it.

**Standing directives (apply to every PR):**
- **Depth and accuracy over speed.** Latency is not a design constraint; correctness is.
- **The AU moat is engineered, not assumed** — super/CGT-discount/HECS math lives in code and
  constants, never left to the model's general knowledge.
- All repo hard rules hold: IDOR-safe `user_id` scoping in SQL, deterministic tests for money
  math, sandbox credentials only, no PII in logs, migrations touching
  `users`/`transactions`/`session` flagged for human review.

---

## Domain model (ubiquitous language)

- **Gateway** — `services/gateway.js`, the single entry point for all LLM calls. Callers ask for
  a **role**, never a provider.
- **Role** — `reasoner` (synthesis/drafting), `verifier` (critique/revision pass), `cheap`
  (classification, extraction, titling, merging). Each maps to a provider+model via env.
- **Verify pass** — blocking verify-and-revise round run by the `verifier` role on advisor
  replies and research reports.
- **Widget spec** — declarative JSON a model emits to render UI in chat:
  `{type: "donut"|"table"|"stat-card"|"line", title, data, source?}`. `source` names a
  whitelisted data query so a saved widget stays live.
- **Memory doc** — one synthesized markdown document per user (`advisor_memory`), inferred from
  conversations. Distinct from **custom instructions**, which are authored by the user.
- **Usage counter** — per-user, per-feature, per-month count enforcing plan limits
  (`usage_counters`).
- **Radar template** — a seeded, wealth-stage-tiered starting point for a radar
  (`radar_templates`).
- **Constants hierarchy** — the three-layer AU knowledge order of authority:
  `lib/au-constants.js` (authoritative) > live web search via Exa (time-sensitive facts) >
  `knowledge_chunks` RAG (stable concepts). Constants win every numeric conflict.
- **Deep research job** — an async multi-phase pipeline row in `research_jobs`:
  Plan → Gather → Compute → Write → Verify → Render.

---

## The 12 agreed decisions

### 1. Scope
Tier 1 + Tier 2 only, shipped as the 11-PR sequence below. Each PR small, reviewable,
independently shippable.

### 2. Gateway = Node module, not a LiteLLM service
Build `services/gateway.js` generalizing the existing precedence chain in `services/advisor.js`
(see `providerConfig`, `azureChatCompletion`; exports `chat`, `complete`, `extractFigures`,
`hasAdvisor`). Named roles, OpenAI-compatible adapters (Anthropic gets a thin adapter), fallback
chains. Design so `GATEWAY_BASE_URL` can later point the whole thing at a self-hosted LiteLLM
proxy — that graduation is out of scope for this batch. Evolve `advisor.js` to call the gateway;
do not rewrite it.

### 3. Model roles and env
| Role | Provider | Env |
|---|---|---|
| `reasoner` | Azure OpenAI | existing `AZURE_OPENAI_*` (already in Render) |
| `verifier` | Anthropic Claude | **`ANTHROPIC_API_KEY`** + optional **`ANTHROPIC_MODEL`** (default `claude-sonnet-5`) |
| `cheap` | Groq | existing `GROQ_API_KEY` (already in Render) |

Every role degrades gracefully: missing verifier key → skip the verify pass with a log line;
missing cheap key → fall back to reasoner. Never hard-error on a missing key.

### 4. Verifier behavior
Verify-and-revise, **blocking**, on BOTH Ask Maal replies and research reports. Rubric is
narrow and checkable — nothing else:
1. Numeric/math consistency within the answer.
2. AU constants vs the injected `buildConstantsPrompt()` values (directly fixes the known
   SG-11%-vs-12% class of bug).
3. Claims vs the user's actual injected data (profile, score, transactions, snapshots, goals).

If issues found: reasoner gets ONE revision round with the critique, then ship regardless. No
style/tone review. User sees only the final answer.

### 5. Generative UI in chat
The reasoner gets tools over real data (`get_net_worth_trend`, `get_holdings_breakdown`,
`get_cashflow_summary`, `get_score_breakdown`, `get_goals_summary`, web search, …) and emits
**widget specs** inline. The React client (`client/`) renders specs with the dashboard's
existing chart components — the model never writes SVG/HTML. **Add to Dashboard** persists the
spec to `user_widgets`; saved widgets are **live** (the `source` field re-runs a whitelisted
query — same whitelist as the tool functions — not a frozen snapshot). Inline source citations
and follow-up question chips ship with this.

### 6. Advisor memory + custom instructions
- `advisor_memory` table: `user_id`, `content` (markdown), `updated_at`. One doc per user with
  sections: *Personal context / Financial situation / Preferences & instructions / Notable past
  discussions*.
- Written by the `cheap` role on a **deferred** trigger (thread next touched from a different
  session, or a short debounce) — never synchronously per turn. Merge pass = existing memory +
  new transcript → updated doc.
- **Never store account numbers or raw balances** — live figures come from the DB; memory holds
  context the DB doesn't (goals talked about, preferences, standing requests).
- Injected into `buildSystemPrompt` (services/advisor.js:155) with the rest of the context.
- Steerable: "what do you remember about me?" answers from the doc; "forget X" edits via tool
  call; Settings gets view/edit/clear.
- **Custom instructions** = separate authored field (profile/settings column, ~500 chars),
  injected distinctly. Authored ≠ inferred.

### 7. Channels (Polsia is retired — old build; do not use it)
- **Email = Resend**, from scratch (`RESEND_API_KEY`/`EMAIL_FROM` already in Render). This batch
  ships **outbound only**: daily portfolio-summary digest (opt-in notification pref) and
  research-complete notification. Inbound email-to-advisor is deferred (Resend inbound webhooks
  are the later path — no new vendor).
- **SMS**: `POST /webhooks/twilio/sms` → validate Twilio signature → match sender to a user by
  **verified phone** → build the same advisor context as `/api/v1/advisor/message` →
  `advisor.chat()` → reply by SMS (text-only rendering, long answers split). Unknown senders get
  a canned "text from your registered number" reply. Built against existing `TWILIO_*` env vars
  but **feature-flagged dormant** until Mahmoud provisions the full Twilio account + AU inbound
  number — code ships, activation is env config.
- SMS messages consume the advisor-message budget; free tier gets an upgrade-prompt reply.

### 8. Deep research pipeline
- **In-process async** (no worker/queue this batch). `research_jobs` table (`user_id`, `status`,
  `phase`, `started_at`, `result`, …); pipeline runs as a background promise in the Express
  process; client polls `GET /api/v1/research/:id` for phase + elapsed time. On server boot,
  mark orphaned running jobs failed and offer retry. Research volume is tiny; a deploy-killed
  job is a retry, not a disaster. Graduating to a worker later changes where it runs, not its shape.
- Phases: **Plan → Gather** (Finnhub + Financial Datasets + Exa) **→ Compute** (plain-JS quant:
  beta = cov/var, annualized vol, drawdowns, Monte Carlo with seeded RNG) **→ Write** (reasoner,
  AU framing: super/CGT/HECS) **→ Verify** (decision 4) **→ Render** (charts + branded PDF).
- Output bar = Silvia's downloaded PDF: branded cover, running header/footer, generated charts
  **titled by insight not metric**, tables, plain-English callouts, methodology appendix,
  disclaimer. Charts server-rendered SVG→PNG; PDF via the existing pdf-lib path in
  `services/report.js`. **Get unicode right** (minus signs, ≈, √) — Silvia renders "?"; being
  correct here is a cheap polish win.
- **Keep Isaacus** (`services/isaacus.js`) for legal/tax extraction — extractive, not chat; it
  sits beside the gateway, invoked on legal intent, unchanged.

### 9. Data providers
- **New `services/financialdatasets.js`** — REST API at `api.financialdatasets.ai`, env
  **`FINANCIAL_DATASETS_API_KEY`** (account created). Depth source: financial statements,
  fundamentals, insider trades, SEC filings, historical data. US-centric — use it for research
  depth; ASX/AU coverage stays with Finnhub.
- `services/marketdata.js` (Finnhub) keeps live quotes/news/earnings/search.
- **Web search = Exa** (`EXA_API_KEY`), replacing Bing (never went live) in
  `services/grounding.js`. Tavily is the named fallback vendor; do a short comparison during
  PR 8 before locking. Exposed to the advisor as a callable tool and used in research Gather.
- All providers degrade to `[]`/null with no key.
- **Exa integration notes** (from Exa's setup guide, 2026-07-12; canonical reference —
  fetch before building PR 8 and report staleness:
  https://docs.exa.ai/reference/search-api-guide-for-coding-agents):
  - SDK `exa-js` (`new Exa(process.env.EXA_API_KEY)`); key is set on Render.
  - Advisor tool: `type: "auto"`, `numResults` ~5–10, `contents: { highlights: true }`
    (token-efficient excerpts; `text`/`summary`/`highlights` must be NESTED under `contents`
    on `/search`).
  - Research Gather phase: `type: "deep"` (or `deep-reasoning` for hard synthesis);
    `outputSchema` + `systemPrompt` available for grounded structured JSON with field-level
    citations (`output.grounding`) — an option for the Gather step, but raw
    `results`+`highlights` into our own pipeline is the default.
  - Freshness: `contents.maxAgeHours` (e.g. 24 for news; omit for default). `livecrawl:
    "always"` is deprecated → `maxAgeHours: 0`.
  - Full text when needed: `text: { maxCharacters: 20000 }` — always cap.
  - `/contents` endpoint for URLs we already hold (e.g. re-fetching a cited source);
    `getContents(urls, { highlights: true })`.
  - Deprecated/nonexistent params to avoid: `useAutoprompt`, `includeUrls`/`excludeUrls`
    (use `includeDomains`/`excludeDomains`), `numSentences`, `highlightsPerUrl`, `tokensNum`.
  - AU constants drift-check (decision 12): `includeDomains: ["ato.gov.au"]`-style filtering
    is the intended pattern for checking official sources.
- Note for implementing agents: the `financial-datasets` MCP server configured in Claude Code is
  **dev-time only** (for exploring their data while building). Production code calls the REST API.

### 10. Usage metering (pricing locked by Mahmoud — free tier must cost $0 in AI)
| Feature | Free | Pro $20/mo | Max $200/mo |
|---|---|---|---|
| Advisor messages / month | 0 | 500 | **1,000 (soft cap)** |
| Deep research runs / month | 0 | 10 | 50 |
| Active radars | 0 | 10 | 50 |
| AI-generated files / month | 0 | 10 | 100 |

- **Count-based**, not tokens. Resets on the 1st. Usage shown in Settings → Billing (Silvia-style).
- Free = "see everything, AI locked": composer/research/radar UIs render **upgrade prompts,
  never errors**. Non-AI features (dashboard, transactions, goals, vault, manual assets) stay free.
- Enforced by middleware + `usage_counters` table keyed off `users.plan`. Limits live in one
  config object so raising free-tier allowances later is a one-line change.
- **Metering ships before any new AI feature** (PR 2 before PR 3) — this is the cost guardrail.

### 11. Radar upgrades
- **Template marketplace**: ~15 AU templates drafted by the implementing agent, **reviewed by
  Mahmoud in the PR**. 5 categories (Super & Tax / Portfolio / Property / Cash Flow / Market
  Events) × 3 wealth stages (Getting Started / Building / Established). Seeded rows in
  `radar_templates` — SQL-editable without a deploy. AU content is the moat: concessional-cap
  pacing before June 30, HECS indexation warnings, franking season, co-contribution eligibility,
  ASX reporting seasons, RBA decisions.
- **Two creation paths**: (a) inline quick-config panel (free-text + notify email/SMS multi-select
  + daily/weekly(+day-of-week)/monthly + timezone); (b) agentic — template click sends a
  "personalize to my holdings, then confirm before creating" message through advisor chat.
- Marketplace browsable by everyone; creating requires Pro/Max (shop window for free tier).

### 12. AU knowledge freshness (the annual-check contract Mahmoud required)
Three layers, order of authority explicit in the system prompt and enforced by the verifier:
1. **`lib/au-constants.js`** (exists — extend, don't recreate): re-key by financial year, each
   value with `effectiveFrom` + source URL. App selects by today's date, so legislated future
   changes (e.g. the SG schedule) are entered once, in advance, and switch automatically on
   July 1. Authoritative — wins all numeric conflicts.
2. **Freshness alarm**: a deterministic test that **fails when the current FY has no reviewed
   entry** — CI itself demands the annual review every July. Plus a monthly cron drift-check
   (cheap model + Exa vs official ATO pages, same cron pattern as the radar sweep) that
   **proposes** discrepancies to Mahmoud — a human confirms; tax-law changes never auto-apply.
   Only **enacted** legislation enters constants; **proposed** changes are discussed by the
   advisor via live search with citations (the distinction is explicit in the system prompt).
3. **`knowledge_chunks` RAG** (`lib/rag.js`) kept for stable concepts (debt recycling, FHSSS
   mechanics). Audit pass in PR 3: date-stamp every chunk, move FY-specific figures out to
   constants, instruct the model that constants override chunks.

---

## PR sequence (locked — build in this order)

| # | PR | Key new tables | Key files |
|---|---|---|---|
| 1 | Gateway + verifier + AU-constants FY structure, freshness test, drift-check cron | — | `services/gateway.js` (new), `services/advisor.js`, `lib/au-constants.js`, `test/` |
| 2 | Usage metering + Settings/Billing usage UI + free-tier upgrade prompts | `usage_counters` | middleware in `routes/api.js`, `client/` billing/settings |
| 3 | Agentic advisor v1: tool-calling + widget JSON + citations + follow-up chips + Add-to-Dashboard + RAG audit | `user_widgets` | `services/advisor.js`, `routes/api.js`, `client/` chat + dashboard |
| 4 | Advisor memory + custom instructions + composer niceties (stop, draft autosave, download convo, voice input) | `advisor_memory` | `services/advisor.js`, `db/advisor.js`, `client/` |
| 5 | Activation pack: setup checklist, inline Ask tile, low-data nudge | — | `client/` dashboard, counts read off existing `/api/v1/*` |
| 6 | Transactions depth: rules engine + 18-group taxonomy + subscriptions detection | `transaction_rules` | `db/transactions.js`, `routes/api.js`, `client/` transactions |
| 7 | Source-linked live goals (Grow/Save/Pay Off/Invest; source = net worth / account / debts; target $ or %) | goals table additive columns | `db/goals.js`, `client/` goals |
| 8 | Deep research pipeline (async jobs, quant, Financial Datasets + Exa, Verify, branded PDF) | `research_jobs` | `services/research.js`, `services/financialdatasets.js` (new), `services/grounding.js`, `services/report.js` |
| 9 | Radar upgrades (template marketplace, two creation paths, scheduling) | `radar_templates` | `services/radar.js`, `db/radar.js`, `client/` radar |
| 10 | Channels: dormant Twilio SMS webhook + Resend outbound (daily digest, research-complete) | — | `services/sms.js`, `services/email.js` (Resend rewrite), new webhook route |
| 11 | AI-generated files emailed on request (Excel/CSV/PDF from user's real data; Pro/Max) | — | composes gateway + report + email |

All new tables are **additive-only** migrations. Anything structural on
`users`/`transactions`/`session` → flag for human review, never auto-apply.

## New env vars (Render)

`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (optional, default `claude-sonnet-5`),
`FINANCIAL_DATASETS_API_KEY`, `EXA_API_KEY`. Later: full `TWILIO_*` activation for inbound SMS.
Resend vars already present. Everything degrades gracefully when unset.

## Verification bar (every PR)

1. **Deterministic tests** for anything numeric: metering counters/resets, subscription
   detection, goal-progress derivation, research quant (seeded RNG), constants freshness.
2. **Advisor evals extended** (CI already runs them): verifier catches a planted wrong SG rate;
   widget-JSON validity; memory merge stores no account numbers; injection resistance on new tools.
3. **Live verification before merge**: `cd client && npm run build`, boot server, drive the
   changed flow in the browser, attach proof (screenshot/network trace) to the PR. Also
   `npm test` + `node scripts/render-test.js` where views change.
4. **Migration guard** per above.
5. Exception: pure-UI PRs (5; the niceties half of 4) skip deterministic tests — render-test +
   live browser verification suffice.
