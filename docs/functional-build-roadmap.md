# Maal functional build roadmap

This is the persistent delivery checklist for the functionality roadmap. Update it
after every successful build, including the verification command and commit.

Status: `[ ]` planned · `[~]` in progress · `[x]` built

## 1. Trustworthy financial data

- [x] Build 1.1 — Add append-only raw source records, calculation audit records,
  persisted data-quality findings, and deterministic quality checks.
- [ ] Build 1.2 — Run quality checks after imports and expose a user-scoped
  health summary API.
- [ ] Build 1.3 — Add reconciliation between provider balances and calculated
  transaction balances.
- [ ] Build 1.4 — Add calculation lineage to net worth, score, cash flow, and
  investment metrics.

## 2. Durable automation

- [ ] Build 2.1 — Introduce a durable background-job table and worker contract.
- [ ] Build 2.2 — Make imports idempotent, resumable, and observable.
- [ ] Build 2.3 — Add connection-health monitoring and consent-expiry handling.
- [ ] Build 2.4 — Add operational alerts and backup/restore verification.

## 3. Transaction intelligence

- [ ] Build 3.1 — Harden incremental transaction ingestion and pending-to-settled
  reconciliation.
- [ ] Build 3.2 — Improve categorisation rules and learned suggestions.
- [ ] Build 3.3 — Detect internal transfers, card repayments, refunds, and
  reversals.
- [ ] Build 3.4 — Detect recurring income, bills, and subscriptions.

## 4. Historical truth

- [ ] Build 4.1 — Add account reconciliation workflows and adjustments.
- [ ] Build 4.2 — Produce reliable daily net-worth snapshots.
- [ ] Build 4.3 — Explain material changes between snapshots.
- [ ] Build 4.4 — Calculate investment performance independently of deposits.

## 5. Forecasting and reporting

- [ ] Build 5.1 — Forecast account balances from recurring cash flows.
- [ ] Build 5.2 — Detect likely cash shortfalls and upcoming obligations.
- [ ] Build 5.3 — Generate immutable monthly financial-close reports.
- [ ] Build 5.4 — Add complete CSV/JSON financial exports.

## 6. Planning

- [ ] Build 6.1 — Add goal feasibility and required-contribution calculations.
- [ ] Build 6.2 — Add emergency-fund coverage calculations.
- [ ] Build 6.3 — Add debt avalanche, snowball, and custom payoff plans.
- [ ] Build 6.4 — Track plan progress and outcomes.

## 7. Scenarios and recommendations

- [ ] Build 7.1 — Add isolated, non-destructive scenario modelling.
- [ ] Build 7.2 — Add transparent financial-health rules.
- [ ] Build 7.3 — Rank actions by impact, urgency, confidence, and effort.
- [ ] Build 7.4 — Track recommendation completion and measured outcomes.

## 8. Collaboration and compliance

- [ ] Build 8.1 — Add household membership and ownership boundaries.
- [ ] Build 8.2 — Add scoped, read-only accountant/adviser access.
- [ ] Build 8.3 — Add tax-ready exports and supporting-document links.
- [ ] Build 8.4 — Add complete data portability and deletion workflows.

## 9. Extensibility

- [ ] Build 9.1 — Add a reusable notification service and preferences.
- [ ] Build 9.2 — Generalise automation into an event/condition rules engine.
- [ ] Build 9.3 — Add a complete activity ledger for sensitive operations.
- [ ] Build 9.4 — Add scoped API tokens and webhooks.

## Build log

| Build | Status | Verification | Commit |
|---|---|---|---|
| 1.1 | Built 2026-07-30 | `node test/data-quality.test.js`; `npm run test:integrity-db`; `npm test` | This commit |
