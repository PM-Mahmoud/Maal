# Maal — Agentic Engineering SDLC Plan

Built from Google's *The New SDLC With Vibe Coding* (May 2026), mapped onto Maal's actual
stack: Next.js, Supabase, Neon, Basiq (CDR intermediary), Azure OpenAI, Render/Azure
Australia. You're already running Claude Code / Cursor daily — this plan is about turning
that into a harness, not about adopting new tools.

**Why full agentic engineering for Maal specifically:** Maal touches consumer financial data
through a CDR intermediary. The paper's own line applies directly: *"Telling a CTO that your
team is vibe coding their payment processing system will, and should, raise alarm bells."*
Financial education content generation (lower stakes, LLM-judged) and CDR/Basiq data flows
(higher stakes, deterministic) need different rigor — the plan below splits them.

---

## 0. The core equation

> Agent = Model + Harness

Claude Code / Cursor is the model+runtime. Everything below is the harness you build once
and reuse across every feature. Most agent failures in a fintech app are harness failures
(missing guardrail, vague rule, stale context) — not model failures. Debug there first.

---

## 1. Requirements, Planning & Architecture — *Configuring the Harness*

This phase produces the static context every future agent session loads.

### 1.1 Repo structure to create this week

```
/AGENTS.md                  # or CLAUDE.md — always-loaded rules
/docs/architecture.md       # trade-offs already made, not to be re-litigated by an agent
/specs/                     # one spec per feature, written before implementation
/evals/                     # eval datasets + rubrics, versioned like code
/.claude/skills/            # Agent Skills, loaded on demand
/.claude/hooks/             # pre-commit / pre-deploy deterministic checks
/tests/                     # deterministic test suite
```

### 1.2 AGENTS.md — starter skeleton

Keep it to ~10 lines to start; add a rule every time the agent does something it shouldn't
repeat.

```markdown
# Maal — Agent Rules

Stack: Next.js (App Router), Supabase (auth/db), Neon (Postgres), Basiq (CDR/open banking),
Azure OpenAI (financial education generation), Render/Azure Australia (hosting).

## Hard rules (never violate)
- Never write, log, or commit real Basiq access tokens, client secrets, or user PII.
- Never modify a Supabase/Neon migration that touches `users`, `accounts`, or `consents`
  tables without flagging it for human review — do not auto-apply.
- Never call the Basiq API against production credentials from a dev/test branch.
- Treat all data returned by Basiq as PII until proven otherwise.
- Financial calculations (balances, transaction categorisation, projections) must be
  covered by a deterministic test before merge — never "looks right" verification.

## Workflow
- Read /specs/<feature>.md before implementing.
- Run /evals/<relevant-suite> before opening a PR touching AI-generated content.
- Use conductor mode (inline, Claude Code/Cursor) for anything touching consent flows
  or money logic. Use orchestrator/background mode for content generation, test
  generation, and non-critical refactors.
```

### 1.3 Architecture doc

One page, written by you (not the agent): auth model, data flow from Basiq → Supabase →
Neon, where Azure OpenAI sits (content generation only, never in the money-movement path),
and the CDR consent lifecycle. This is what stops an agent from "helpfully" restructuring
your consent flow because it looked inefficient.

### 1.4 Session/Memory Store & Observability

Two harness components easy to skip early and expensive to bolt on later:

- **Session/Memory store**: where agent session state persists across a multi-step task
  (e.g. a Claude Code session working through a Basiq integration feature across several
  hours). Doesn't need to be fancy at your stage — a `.claude/` session log or your existing
  git history is enough — but decide now where "what the agent did and why" lives, so it's
  reconstructable later.
- **Observability & tracing**: log every agent run that touches Basiq or Azure OpenAI
  separately from normal app logs — model/tool calls, token cost, latency, and (for Basiq)
  which sandbox vs. live credential was used. This is what lets you answer "why did the
  agent do that" after the fact, and it's also your evidence trail if a CDR compliance
  question ever comes up.

---

## 2. Context Engineering — Static vs Dynamic

| Type | Goes in | Examples for Maal |
|---|---|---|
| Static (always loaded) | `AGENTS.md` | Hard rules above, stack, tone/style |
| Static | `docs/architecture.md` (referenced, not always full-loaded) | Auth model, data flow |
| Dynamic (loaded on task match) | `.claude/skills/basiq-integration.md` | Basiq API shapes, webhook handling, error codes |
| Dynamic | `.claude/skills/cdr-consent-flow.md` | Consent state machine, expiry/revocation rules |
| Dynamic | `.claude/skills/supabase-migration.md` | Migration conventions, RLS policy patterns |
| Dynamic | `.claude/skills/financial-content-gen.md` | Azure OpenAI prompt patterns, tone, compliance disclaimers required in generated content |

Build these skills incrementally — write one the first time you find yourself explaining the
same context to the agent twice in a session.

---

## 3. Implementation — *Running the Harness*

**Conductor mode** (real-time, in-IDE, you watching every line): consent flows, Basiq
webhook handlers, any code that moves or interprets money, auth changes.

**Orchestrator mode** (async, background agent, review-on-completion): financial education
content generation, test/eval generation, non-critical UI, migrations to newer library
versions, documentation.

Sandbox rule: dev/test always run against Basiq's sandbox environment and a Neon branch
database, never production credentials — enforce this as a hook (below), not a convention.

---

## 4. Testing & QA — the eval/test contract

This is the part that actually turns vibe coding into agentic engineering. Split by
determinism:

**Tests (deterministic — checked by code):**
- Balance/transaction calculation logic
- Consent state transitions (granted → active → expired/revoked)
- Basiq webhook signature verification and error handling
- RLS policies (a user cannot read another user's accounts — write this as an actual test,
  not a review checklist item)

**Evals (non-deterministic — checked by rubric/LM judge):**
- Financial education content generated via Azure OpenAI: accuracy, tone, required
  disclaimers present, no implied financial advice
- Any agent trajectory that touches Basiq: did it use sandbox creds, did it avoid logging
  PII, did it handle the documented error codes

Write the eval rubric *before* generating the feature — it's the contract that tells the
agent (and you) what "correct" means. A vague eval measures nothing.

**CI gate (non-negotiable for merge):**
1. Deterministic test suite passes
2. Eval suite passes threshold (define per-feature, e.g. 95% on content evals)
3. Secret scan passes (see hooks below)
4. No direct migration to protected tables without a human-reviewed flag

**The failure-feedback loop:** don't treat a failed test/eval as "stop and ask the human."
The factory pattern is: spec → planning agent → coding agent → tests & verification → on
fail, route the failure back to the agent to retry within the same session, bounded by a
retry limit (e.g. 3 attempts) before it escalates to you. This is what makes agentic
engineering faster than vibe coding despite the extra structure — the loop self-corrects
without you re-explaining context each time. Configure this as an explicit instruction in
`AGENTS.md` ("on test failure, read the error, retry up to 3 times, then stop and report"),
not an implicit assumption.

---

## 5. Code Review & Deployment — *Observing the Harness*

**Hooks (`.claude/hooks/`):**
- `pre-commit`: secret/credential scan (block any Basiq token, Supabase service key, or
  Azure OpenAI key pattern)
- `pre-commit`: block commits touching `/migrations/*users*`, `*accounts*`, `*consents*`
  without a `[reviewed]` tag in the commit message
- `pre-deploy`: confirm target is not production if branch isn't `main`

**Human review checklist** (in addition to normal review) for anything AI-generated that
touches financial logic or Basiq data:
- Does error handling cover Basiq's documented failure modes (token expiry, rate limits,
  bank connection failures), not just the happy path?
- Are hallucinated imports/packages present? (Check this explicitly — it's a known failure
  mode of generated code.)
- Does generated financial content avoid language that could be read as personalised
  financial advice?

**Deployment:** Render/Azure AU staged rollout — dev → staging (Basiq sandbox) → production
(Basiq live). Observability should track token cost/latency for the Azure OpenAI content
path separately from the Basiq data path, since they have very different failure and cost
profiles.

---

## 6. Maintenance

- Regression eval suite runs on a schedule (weekly is reasonable at your stage), not just
  on PRs — catches drift if Basiq changes API behaviour or Azure OpenAI model updates shift
  output style.
- Track Basiq API version/deprecation notices explicitly; this is the kind of external
  dependency change that silently breaks agent-generated integration code.

---

## 7. Model routing (cost lever)

- **Frontier model** (your main Claude Code/Cursor sessions): architecture decisions,
  consent flow logic, Basiq integration, anything in conductor mode.
- **Cheaper/faster model**: test generation, content eval scoring, routine refactors,
  changelog/doc generation — route these explicitly rather than defaulting every call to
  the frontier model.

---

## 8. Where Agents CLI / ADK does (and doesn't) apply to Maal

Google's Agents CLI (`uvx google-agents-cli setup`) bundles skills for building, evaluating,
and deploying *production agents* on Google Cloud, callable from Claude Code/Cursor. It's
built for when the thing you're shipping is itself an agent — not for building an app that
happens to use AI.

- **Not applicable** to the core Maal app (auth, accounts, Basiq sync, dashboard) — that's a
  regular application, not an agent product.
- **Potentially applicable** to the Azure OpenAI financial-education content path *if* it
  evolves into something more agentic than single-shot generation — e.g. a user-facing
  assistant that answers financial questions by pulling the user's own transaction data.
  If/when you build that, it fits the ADK lifecycle (scaffold → eval → deploy →
  observe) directly, and you'd manage it as its own harness within `.claude/skills/` rather
  than folding it into the main app's rules.
- Worth revisiting this section once that feature is actually scoped, not before — no need
  to adopt tooling for a product you haven't built yet.

---

## 9. First two weeks — concrete order of operations

1. Write `AGENTS.md` (use skeleton above, edit to match reality) — 1 hour
2. Write `docs/architecture.md` (auth model, Basiq→Supabase→Neon data flow, consent
   lifecycle) — this is the highest-leverage single document you'll write
3. Set up `.claude/hooks/pre-commit` secret scanning — do this before any more agent
   sessions touch the repo
4. Pick one existing feature (ideally something already built) and retrofit: write its spec
   in `/specs/`, write its deterministic tests, write one eval if it touches generated
   content. This teaches the workflow faster than starting greenfield.
5. Write your first skill: whichever of Basiq integration, consent flow, or Supabase
   migrations you explain to the agent most often
6. Add the CI gate (tests + evals + secret scan) before merge on your next real feature
7. From here: every new feature gets a spec → tests/evals → implementation (conductor or
   orchestrator per §3) → CI gate → review checklist → deploy

---

## Durable principles to keep in view

1. **Structure scales, vibes don't** — for Maal specifically, the gap between "seems to
   work" and "works under all conditions" is where a consent bug or a leaked token lives.
2. **The harness is your asset, not the model provider's** — AGENTS.md, skills, and evals
   compound across every feature you build after this one.
3. **Your role shifts from writing code to writing specs and evals** — that's where your
   judgment is irreplaceable; implementation is where the agent earns its keep.
