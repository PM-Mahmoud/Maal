# Maal — AI Engine Execution Plan

**Derived from:** `mizan-ai-build-plan.md` (your v2 build plan)
**Reconciled with:** the app as actually built (this repo)
**For:** Mahmoud (decisions) + Claude Code (build)
**Updated:** 17 June 2026

---

## 0. The one thing to understand first

Your build plan describes an **ideal greenfield** (Next.js + Azure-Australia Postgres + pgvector,
two-engine "LLM never does maths" architecture, RAG knowledge base, guardrail output checks, qa
logging, tiered models).

The app that **exists today** is a working **Express + EJS + Neon Postgres** app on **Render**, with
a lot of *product* already shipped (auth, dashboard, Basiq, billing, Azure OpenAI advisor, Finnhub
market data, Bing grounding, Radar, Research, Vault, Goals). What it does **not** yet have is the
**AI-engine rigor** the plan is really about.

So this plan does **not** rewrite the app. It **retrofits the build plan's discipline onto the
existing codebase**, in the plan's recommended order, and keeps every legal gate intact.

### Gap map — plan vs reality

| Build-plan element | Status in this repo | Action |
|---|---|---|
| Calculation engine (`lib/calc/`) — compound growth, loan, super, Monte Carlo | ❌ not built (only `lib/maal-score.js`, `lib/tax.js` exist) | **Build — Phase 2** |
| "LLM never does maths" golden rule | ❌ not enforced — advisor/research/radar let the model reason over numbers freely | **Phase 5 (the core fix)** |
| Tiered LLM wrapper (cheap/strong) | ⚠️ partial — `services/advisor.js` is provider-agnostic but single-tier | **Phase 3** |
| RAG knowledge base (pgvector + `knowledge_chunks`) | ❌ not built | **Phase 4** |
| Output guardrail check + `qa_logs` | ⚠️ education-only system prompt only; no post-check, no logging | **Phase 6** |
| Bank data via Basiq (CDR) | ✅ sandbox wired (`services/basiq.js`, `routes/basiq.js`) | Keep in sandbox until legal sign-off |
| Live market data | ✅ Finnhub (`services/marketdata.js`) | Confirm AU coverage + redistribution licence |
| Azure-Australia data residency + RLS | ❌ on Neon today; no RLS | **Phase 1 decision + Phase 7** |
| Auth / app shell / product UI | ✅ done | — |

---

## 1. Decisions to lock BEFORE building (carry over from the plan)

These gate everything. Most are non-coding and are yours, Mahmoud.

1. **Legal (hard gate):** engage a financial-services lawyer on the **advice boundary** (plan §1b),
   **CDR obligations**, and **privacy/consent** — *before connecting any real customer account.*
   Stay in the **Basiq sandbox** until this clears.
2. **Basiq access model:** **CDR Insights** (lighter compliance, further from the advice line) vs
   **Affiliate/sponsored** (full transaction data, heavier obligations). *Recommend starting with
   Insights* (plan §6b) — confirm with the lawyer.
3. **Data residency:** the plan decided **Azure Australia**. Two viable paths (pick one in Phase 1):
   - **A — stay on Neon but in a Sydney region** (AWS `ap-southeast-2`) + add pgvector. Lowest effort,
     keeps Render. Residency-in-AU but on AWS, not Azure.
   - **B — move Postgres to Azure Database for PostgreSQL (Australia East)** + pgvector. Matches the
     plan exactly; more DevOps. Render app can still talk to it.
   *Recommendation:* **B** if a customer/investor/regulator will ask about Azure specifically;
   otherwise **A** is the pragmatic interim. Either way: **AU region + pgvector + RLS** are the
   non-negotiables before real bank data.
4. **Models:** pick the **cheap default** now (e.g. GPT-5 mini / Gemini 3 Flash / Claude Haiku 4.5).
   Wire the **strong tier** behind the same wrapper for later. You're already on **Azure OpenAI** —
   simplest is to use an Azure deployment for the cheap tier and add a stronger Azure deployment for
   the strong tier (no new vendor).
5. **Market-data licence:** confirm Finnhub's AU coverage + redistribution terms are acceptable, or
   swap providers.

---

## 2. Architecture, mapped onto THIS app

The plan's orchestrator = the **Express route handlers** (`routes/dashboard.js` ask/research/radar).
No framework change needed. The two engines slot in as new `lib/` + `services/` modules:

```
POST /dashboard/ask/message  (orchestrator — already exists)
   ├─ needs a calculation?  → lib/calc/*  (NEW, deterministic, unit-tested)
   ├─ needs user data?      → db/* (profiles, accounts, transactions)  ✅ exists
   ├─ needs knowledge?      → lib/rag.js → pgvector knowledge_chunks  (NEW)
   ├─ needs market data?    → services/marketdata.js  ✅ exists
   └─ assemble prompt: system + guardrails + user data + knowledge + CALC RESULTS + question
        → services/advisor.js (tiered)  → output guardrail check (NEW) → log to qa_logs (NEW)
```

**Golden rule to enforce:** the model **never computes a number**. Every figure comes from
`lib/calc/*`, `db/*`, or `services/marketdata.js`. Today the advisor violates this — Phase 5 fixes it.

---

## 3. Phased execution (concrete, in this repo)

### Phase 1 — Decisions + data foundation
- [ ] Lock the §1 decisions (esp. residency path A/B and Basiq model).
- [ ] Provision the AU Postgres (path A or B) **with `pgvector`** enabled; point `DATABASE_URL` at it.
- [ ] Add the new tables: `knowledge_chunks`, `qa_logs`, `feedback` (migration file, like the
      existing ones in `migrations/`).
- [ ] Plan RLS / app-layer per-user enforcement (Phase 7 detail).

### Phase 2 — Calculation engine (do this early; it's the core)
- [ ] `lib/calc/compoundGrowth.js`, `loanAmortisation.js`, `superProjection.js`, `monteCarlo.js`
      (pure, deterministic; each returns `{ numbers, table }`).
- [ ] **Unit tests** for each (add a `npm test` script + a tiny runner; these numbers must be right).
- [ ] Reuse the existing deterministic pieces (`lib/maal-score.js`, `lib/tax.js`) as-is.

### Phase 3 — Tier the LLM wrapper
- [ ] Extend `services/advisor.js`: `complete(messages, { tier })` where `tier` ∈ `cheap|strong`,
      reading `LLM_MODEL_CHEAP` / `LLM_MODEL_STRONG` (or two Azure deployment names). Default = cheap.
- [ ] Route hard requests (portfolio interpretation, Monte Carlo narration) to `strong` later.

### Phase 4 — Knowledge base + RAG
- [ ] `content/knowledge/*.md` — write **10–15 original** explainer articles first (super, HECS, ETFs
      vs managed funds *concepts only*, offset/redraw, emergency funds, CGT basics…). **Paraphrase**
      from ASIC Moneysmart/ATO/APRA/RBA — never copy their text (plan §5).
- [ ] `scripts/ingest-knowledge.js` — chunk (~500 tokens) → embed → insert into `knowledge_chunks`.
- [ ] `lib/rag.js` — embed question → pgvector similarity → top 3–5 chunks → into the prompt.

### Phase 5 — Wire numbers + data into the answer (THE key correctness fix)
- [ ] In the ask/research/radar handlers: detect calculation intent → run `lib/calc/*` →
      pass **results** to the model to *narrate*. The model stops doing maths.
- [ ] Feed RAG chunks + the user's real data (already available) into the prompt context.
- [ ] Add market-data interpretation where relevant (already have the data).

### Phase 6 — Guardrails + logging
- [ ] Tighten the system prompt to the plan's §9 draft (advice-boundary language; **lawyer-reviewed**).
- [ ] **Output guardrail check** after each answer: flag/replace anything that reads as personal
      advice or a product recommendation; set `flagged_by_guardrail`; append the "general information,
      not personal financial advice" line.
- [ ] Log Q + retrieved context + calc results + answer + tier + flag to `qa_logs`; thumbs up/down →
      `feedback`.

### Phase 7 — Residency hardening + strong tier
- [ ] RLS (or enforced app-layer `user_id` checks) on every user-data table.
- [ ] Confirm encryption at rest/in transit; data-minimisation; CDR retention limits.
- [ ] Turn on strong-tier routing for hard cases. Optional per-user memory **summary** (retrieval
      only — no model training, ever).

---

## 4. Guardrail retrofit — specifics (because this is the riskiest gap)

Right now `services/advisor.js`, `services/research.js`, `services/radar.js` hand the model the
user's data and let it reason, including numerically. To get onto the plan's safe footing:

1. **Move every number out of the model's job.** Anywhere an answer needs a projection/scenario,
   compute it in `lib/calc/*` and inject the result; instruct the model to use *only* provided numbers.
2. **Post-answer check** (a cheap second pass or rules): catch "you should", "best for you",
   product/fund/share recommendations, or invented figures → rewrite or flag.
3. **Always append** the general-information disclaimer (already in the footer; also enforce in copy).
4. **Log everything** to `qa_logs` so you can audit what the model said and fix gaps.

---

## 5. What NOT to do (unchanged from the plan)
- ❌ No training/fine-tuning. ❌ LLM never computes numbers. ❌ No screen scraping (Basiq only).
- ❌ The disclaimer is **not** legal cover — get sign-off. ❌ Don't copy Moneysmart/ATO text.
- ❌ Don't connect real customer accounts before the lawyer clears the advice boundary.

---

## 6. Immediate next two actions
1. **You:** book the financial-services lawyer (advice boundary + CDR + privacy) and decide the
   residency path (A: Neon-Sydney, or B: Azure Australia). These unblock everything else.
2. **Claude Code (no legal dependency):** start **Phase 2 — the calculation engine + unit tests**.
   It's pure code, it's the architectural core, and it's needed before the Phase 5 correctness fix.
   Say the word and I'll build `lib/calc/` first.
```
