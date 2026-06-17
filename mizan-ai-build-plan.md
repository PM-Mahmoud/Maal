# Mizan — AI Engine Build Plan (v2)

**For:** Claude Code
**Owner:** Mahmoud
**Last updated:** 17 June 2026

---

## 0. Read this first (context + scope)

Mizan is an AI platform for Australians that does **financial education + analysis of the
user's own financial data**. Users can:
- ask general financial-education questions (plain-English explanations),
- have Mizan analyse their own financial data (pulled from banks + brokers),
- run financial simulations (deterministic projections AND probabilistic/Monte Carlo),
- get plain-English interpretation of live market data and their own positions.

**We are NOT training or fine-tuning a model.** We use frontier model(s) via API + retrieval
(RAG) + a deterministic calculation engine. The model explains; it never invents numbers.

**Tech stack baseline:** Next.js (frontend + API) + **Azure Australia**-hosted Postgres (with
pgvector) + LLM API(s) + **Basiq** for bank data + Stripe (later).

---

## ⚠️ 1. CRITICAL LEGAL FLAGS (read before building anything)

These are not coding details. They gate the whole project. Mahmoud must get a
**financial-services lawyer** to confirm before connecting real customer accounts.
(This plan is not legal advice.)

### 1a. Pulling bank data = Consumer Data Right (CDR), regulated
- Accessing a customer's bank data runs through Australia's **Consumer Data Right (CDR)**.
- To receive CDR data you must be an **Accredited Data Recipient (ADR)**. Full accreditation
  is ~**A$250k** and **3–6 months** via the ACCC. **Do NOT do this yourself at this stage.**
- **CHOSEN: Basiq** — an ACCC-accredited ADR that sponsors you, so you avoid ~A$250k/3–6mo
  unrestricted accreditation. Sponsored/affiliate or Insights arrangement is the startup path.
  See Section 6b for the access-model decision. (Fiskil / Adatree are fallback options.)
- **Screen scraping (asking users for bank logins) is explicitly OUT.** It's being phased out
  and is a compliance/security liability.
- **Broker data is separate from CDR.** It needs per-broker API agreements or a broker
  aggregator. Treat as its own integration task; confirm what each broker offers.

### 1b. The "not financial advice" disclaimer is NOT a shield
- Once Mizan ingests a specific user's real bank/broker holdings and runs simulations /
  interprets their position, a disclaimer at the bottom may **not** keep Mizan outside
  **personal financial advice** law.
- Australian regulators judge **substance**: if a reasonable user would believe the output is
  tailored to their personal situation, it can be **personal advice** → requires an **AFSL**.
- **Build posture to stay on the safe side (enforced in code + prompts):**
  - Explain concepts and describe the user's numbers factually.
  - **Never** recommend products, providers, funds, shares, or actions.
  - **Never** output "you should…", "the best option for you is…", or equivalent.
  - Frame simulations as illustrative scenarios, not recommendations.
  - Always show the "general information, not personal advice" framing.
- **Action:** lawyer sign-off on the advice boundary BEFORE connecting real accounts. Consider,
  later, partnering with / operating under an AFSL holder if the product moves toward advice.

---

## 2. Architecture (two engines, one orchestrator)

```
User request
     │
     ▼
Next.js API route (orchestrator)
     │
     ├── Needs a calculation? ──► CALCULATION ENGINE (our own code, deterministic)
     │                              • compound growth / savings projection
     │                              • loan amortisation / payoff
     │                              • Monte Carlo (probabilistic scenarios)
     │                              → returns exact numbers + a results table
     │
     ├── Needs the user's data?  ──► query Postgres (bank/broker data via CDR intermediary)
     │
     ├── Needs general knowledge?──► pgvector similarity search over knowledge base
     │
     ├── Needs live market data? ──► market-data API (see 6c)
     │
     ▼
Assemble prompt: system prompt + guardrails + user data + knowledge + CALC RESULTS + question
     │
     ▼
LLM (tiered — cheap default, strong for hard cases)  → explains results in plain English
     │
     ▼
Output guardrail check  →  answer + "general information only" framing  →  log everything
```

**Golden rule: the LLM never does maths.** Every number a user sees comes from the calculation
engine or from real data. The model only explains and narrates. This is the #1 defence against
financial hallucination.

---

## 3. Model choice — two-tier (cheap now, strong when ready)

Mizan has a mix of easy (explain a concept) and hard (interpret a portfolio, narrate a Monte
Carlo) requests. Use **two models behind one wrapper** and route per request.

| Tier | Use for | Example models (mid-2026) | Rough cost /1M (in/out) |
|------|---------|---------------------------|--------------------------|
| **Cheap (default)** | General education, simple explanations | GPT-5 mini (~$0.25/$2), Gemini 3 Flash (~$0.50/$3), Claude Haiku 4.5 ($1/$5) | low |
| **Strong (hard cases)** | Portfolio interpretation, multi-step reasoning, nuanced scenarios | GPT-5.2 (~$1.75/$14), Gemini 3 Pro (~$2/$12), Claude Opus tier (~$5/$25) | high |

**Decision for now:** implement the **cheap tier** as the working default. Wire the strong tier
behind the same `lib/llm.ts` wrapper with a `tier` parameter so it can be switched on per-query
later with no rebuild. **Important:** whichever model you use, it still must not compute numbers
(Section 2) — even strong models hallucinate on multi-step financial maths.

```
# .env.local
LLM_API_KEY=...
LLM_MODEL_CHEAP=...
LLM_MODEL_STRONG=...
```

---

## 4. Hosting & data storage — DECIDED: Azure Australia

Decision: **Azure Australia** (full-sovereignty requirement dropped for now). Strong Australian
data **residency** + enterprise controls, and the path most Australian fintechs actually use.
Honest caveat retained: Microsoft is US-parented, so this is **residency + strong contractual
controls, not pure sovereignty** (technically still CLOUD Act-reachable). If a customer,
investor, or regulator later demands certified sovereignty, the migration target is a sovereign
Australian cloud (Vault Cloud / AUCloud) — but that means self-hosting Postgres and is out of
scope now.

**Concrete setup:**
- Host the Next.js app + Postgres in an **Australian Azure region** (e.g. Australia East).
- Use **Azure Database for PostgreSQL** (managed) with the **pgvector** extension enabled, OR
  self-managed Postgres on Azure — managed is recommended to reduce DevOps.
- Use Microsoft's in-country data processing options where available.
- Auth: pick one (Azure-hosted auth, or a library like Auth.js / Lucia running on Azure). The
  schema below is auth-agnostic (user ids are uuids).

**Data-handling requirements:**
1. **Row Level Security** (or equivalent app-layer enforcement) on every user-data table — users
   access only their own rows.
2. Encryption at rest + in transit (on by default in Azure managed Postgres — confirm).
3. **Data minimisation:** store only what's needed. CDR data has strict use/retention limits —
   follow Basiq's CDR obligations (Section 6b).
4. Explicit, granular **consent flow** for bank data (handled via Basiq's consent UI — Section 6b).
5. Privacy policy + consent reviewed by a lawyer before real users.
6. Never send more of the user's data to the LLM than the specific request needs.


## 5. Knowledge base — high quality, legally clean

You want a strong financial-reference base. Build it from authoritative Australian sources but
keep it **legally clean for commercial use.**

- **Primary reference:** ASIC **Moneysmart** — authoritative, but licensed **non-commercial
  only**, so you **cannot copy its text** into a commercial product. Use it as a *reference* and
  write **original** content in your own words, with attribution.
- **Other reputable references to write from:** ATO (tax/super basics), APRA (super/banking
  context), RBA (rates/economics explainers). Same rule — paraphrase into original content.
- **Depth:** aim for a serious base of original explainer articles (target ~50–100 over time),
  each chunked + embedded into pgvector. Cover: super (contributions, caps, preservation),
  investing concepts (diversification, risk, asset classes, ETFs vs managed funds — concepts
  only, no recommendations), tax basics, debt/loans, offset/redraw, budgeting, emergency funds,
  insurance types, HECS/HELP, retirement-planning concepts, market mechanics.
- **Format:** markdown files in `/content/knowledge/` with frontmatter
  (`title`, `topic`, `source_note`). Ingestion script chunks (~500 tokens) → embeds → inserts.

(No clean commercial-use open-source Australian finance corpus exists — original content from
authoritative references is the standard, defensible path and becomes your moat.)

---

## 6. Components to build

### 6a. Calculation engine (`lib/calc/`) — build EARLY, it's core
Pure, deterministic, unit-tested functions. No LLM involved.
- `compoundGrowth({ principal, contributionPerPeriod, annualRate, years, frequency })`
- `loanAmortisation({ principal, annualRate, termYears, repaymentFrequency })`
- `superProjection({ balance, salary, contributionRate, annualReturn, years })`
- `monteCarlo({ startingBalance, contributions, years, returnMean, returnStdDev, runs })`
  → returns distribution + success probability for probabilistic scenarios.
- Every function returns structured results (numbers + a table) the LLM will narrate.
- **Write unit tests** — these numbers must be correct.

### 6b. Bank data ingestion — via Basiq (CHOSEN intermediary)
**Basiq is the chosen CDR intermediary** (already connected in sandbox). Basiq is itself an
ACCC-accredited ADR, so Mizan does NOT need ~A$250k unrestricted accreditation. Basiq handles
the hard CDR plumbing (CDR certificates, conformance test suite, dynamic client registration)
and provides a single unified API + a compliant **consent UI**, connecting to 135+ AU banks.

**DECISION NEEDED — which Basiq access model (changes legal obligations + data depth):**
- **Affiliate (sponsored):** you get affiliate-level CDR accreditation under Basiq's sponsorship.
  Full transaction-level data (richest for analysis/simulations) BUT you take on real CDR
  compliance obligations.
- **CDR Insights:** no external accreditation; you receive lower-risk *insights* (balances,
  income, expenses, account verification) rather than the full raw feed. Much lighter compliance.
- **Trusted Adviser:** for accountants/advisers/brokers — likely NOT Mizan's fit.

*Recommendation to discuss with the lawyer:* start with **CDR Insights** if it gives enough
depth — lighter compliance AND it keeps you further from the personal-advice line. Move to
**Affiliate** only if full transaction data is genuinely required. (Affiliate = richer data but
heavier obligations and closer to the advice boundary.)

**Build steps:**
- Stay in the **Basiq sandbox** until the lawyer clears the advice boundary (Section 1b).
- Implement Basiq's **consent flow** (registration, data-holder selection, consent capture) via
  their consent UI — do not build your own consent screens.
- On consent, sync accounts/transactions (or insights) into our schema (Section 7); normalise
  into `accounts` / `transactions` / (optionally) `holdings`.
- Respect CDR **use + retention limits**; surface the required ADR name/number per Basiq's rules.
- Pricing is **per user/month**, sales-quoted (not public) — get figures from Basiq when going live.
- **Broker data is separate from CDR** (Basiq is bank data). Scope per-broker APIs / a broker
  aggregator separately; confirm what each broker offers. Do not assume CDR covers brokers.
- **Do NOT build screen scraping.**

*(Fallback intermediaries if Basiq's DX/pricing disappoint: **Fiskil** — developer-experience
focused, fast integration; **Adatree** — enterprise/compliance-oriented. All three hold
accreditation so you don't. Stay on Basiq for the build; treat others as switch options.)*

### 6c. Live market data
- Use a market-data API for rates/indices/FX/prices (e.g. a commercial market-data provider —
  pick one with AU coverage and clear licensing; confirm redistribution terms).
- The LLM **interprets** this data in plain English; it does not fetch or compute it directly.

### 6d. RAG retrieval
- Embed question → pgvector similarity search → top 3–5 knowledge chunks into the prompt.

### 6e. LLM wrapper (`lib/llm.ts`)
- Single `askLLM({ systemPrompt, userMessage, tier })`; `tier` = 'cheap' | 'strong'.
- Model ids + key from env vars. Swappable with no rebuild.

### 6f. Guardrails
- Strict system prompt (Section 7).
- Output check after each answer: flag/replace anything reading as personal advice or a product
  recommendation; set `flagged_by_guardrail = true`; append the "general information" framing.

### 6g. Logging & feedback loop
- Log Q, retrieved context, calc results, answer, model tier, guardrail flag to `qa_logs`.
- Thumbs up/down → `feedback`. Review later to fill knowledge gaps + tune prompts/retrieval.

---

## 7. Database schema (starting point — portable Postgres + pgvector)

```sql
create extension if not exists vector;

-- User financial profile (manual + summary fields)
create table profiles (
  id uuid primary key,             -- maps to auth user id (host-dependent)
  display_name text,
  goals text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Bank/broker accounts (populated via CDR intermediary / broker APIs)
create table accounts (
  id bigserial primary key,
  user_id uuid not null,
  source text,                     -- 'cdr_bank' | 'broker' | etc.
  account_type text,
  institution text,
  balance numeric,
  currency text default 'AUD',
  last_synced timestamptz,
  created_at timestamptz default now()
);

create table transactions (
  id bigserial primary key,
  account_id bigint references accounts(id),
  user_id uuid not null,
  posted_at timestamptz,
  amount numeric,
  description text,
  category text
);

-- Holdings (broker positions)
create table holdings (
  id bigserial primary key,
  account_id bigint references accounts(id),
  user_id uuid not null,
  symbol text,
  units numeric,
  avg_cost numeric,
  last_price numeric,
  last_synced timestamptz
);

-- Knowledge base (original content, embedded)
create table knowledge_chunks (
  id bigserial primary key,
  title text,
  topic text,
  content text,
  source_note text,
  embedding vector(1536),          -- match embedding model dimension
  created_at timestamptz default now()
);
create index on knowledge_chunks using ivfflat (embedding vector_cosine_ops);

-- Logs + feedback
create table qa_logs (
  id bigserial primary key,
  user_id uuid,
  question text,
  retrieved_context text,
  calc_results jsonb,
  answer text,
  model_tier text,
  flagged_by_guardrail boolean default false,
  feedback int,
  created_at timestamptz default now()
);

-- Enable RLS on all user-data tables (policy syntax depends on host/auth)
alter table profiles      enable row level security;
alter table accounts      enable row level security;
alter table transactions  enable row level security;
alter table holdings      enable row level security;
alter table qa_logs       enable row level security;
-- Add policies so each user can only access rows where user_id = current user.
```

---

## 8. Build sequence (recommended order)

### Phase 0 — Decisions & legal (before code)
- [x] Hosting: **Azure Australia** (full sovereignty dropped for now).
- [x] CDR intermediary: **Basiq** (connected in sandbox). **TODO:** choose Basiq access model — Insights vs Affiliate (Section 6b), with lawyer.
- [ ] Engage a financial-services lawyer on the **advice boundary** + CDR + privacy.
- [ ] Choose starting cheap model + (later) strong model.

### Phase 1 — Foundation
- [ ] Next.js app (TypeScript). Stand up Postgres + pgvector on chosen host. Auth.
- [ ] Run schema (Section 7); enable RLS + policies.

### Phase 2 — Calculation engine (core, do before LLM polish)
- [ ] Build `lib/calc/` functions (6a) with unit tests. Confirm numbers are correct.

### Phase 3 — LLM wrapper + first end-to-end answer
- [ ] `lib/llm.ts` with cheap tier. `/api/ask` with hardcoded system prompt. Confirm it works.

### Phase 4 — Knowledge base + RAG
- [ ] Write first ~10–15 original articles (Section 5). Ingestion script → embed → pgvector.
- [ ] Wire retrieval into `/api/ask`.

### Phase 5 — Connect numbers + data
- [ ] Route calculation requests through the engine; feed results to the LLM to narrate.
- [ ] Integrate CDR intermediary + consent flow; normalise data; let LLM interpret it.
- [ ] Add live market-data interpretation.

### Phase 6 — Guardrails + logging
- [ ] Strict system prompt + output check (6f). Append "general information" framing.
- [ ] qa_logs logging + thumbs up/down.

### Phase 7 — Strong tier + memory (when ready)
- [ ] Turn on strong-model routing for hard cases.
- [ ] Optional per-user memory summary (retrieval only; no model training).

---

## 9. Guardrail system prompt (draft — refine with lawyer input before launch)

> You are Mizan, a financial **education and analysis** assistant for Australians. You explain
> financial concepts clearly and help users understand their own financial data and simulation
> results in general, factual terms.
>
> STRICT RULES:
> - You provide **general financial information and education only** — never personal financial
>   advice.
> - Never recommend specific products, providers, funds, shares, or actions. Never say what the
>   user "should" do or what is "best for you".
> - When given the user's financial data or calculation/simulation results, describe and explain
>   them factually and illustratively. Do not frame them as recommendations.
> - All numbers come from the provided calculation results or real data — never calculate or
>   estimate figures yourself. If a number isn't provided, say it isn't available.
> - Base factual explanations on the provided knowledge context; if it's not covered, say so
>   rather than inventing details.
> - Plain English; define jargon. End substantive answers with:
>   "This is general information, not personal financial advice."
>
> You will be given: the user's financial data (if relevant), calculation/simulation results (if
> relevant), knowledge context, live market data (if relevant), and the question. Stay within the
> rules above.

---

## 10. What NOT to do

- ❌ Don't train or fine-tune a model.
- ❌ Don't let the LLM compute or estimate numbers — calculation engine only.
- ❌ Don't build screen scraping for bank data — use an accredited CDR intermediary.
- ❌ Don't treat the "not advice" disclaimer as legal protection — get sign-off.
- ❌ Don't copy Moneysmart/ATO/etc. text into the product — write original content.
- ❌ Don't hardcode keys/model names; don't skip RLS; don't over-collect data.

---

## 11. Open items for Mahmoud (non-coding)

- [x] Hosting: Azure Australia. **TODO:** set up Azure account + Australian region.
- [x] CDR intermediary: Basiq. **TODO:** choose access model (Insights vs Affiliate); scope broker data path separately.
- [ ] Lawyer: advice boundary, CDR obligations, privacy/consent — **before real accounts**.
- [ ] Market-data provider selection (check AU coverage + redistribution licence).
- [ ] Write / commission the original knowledge-base content.
- [ ] Pick cheap (now) and strong (later) models.
