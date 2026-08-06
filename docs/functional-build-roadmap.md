# Maal functional build roadmap

This is the persistent delivery checklist for the functionality roadmap. Update it
after every successful build, including the verification command and commit.

Status: `[ ]` planned · `[~]` in progress · `[x]` built

## 1. Trustworthy financial data

- [x] Build 1.1 — Add append-only raw source records, calculation audit records,
  persisted data-quality findings, and deterministic quality checks.
- [x] Build 1.2 — Run quality checks after imports and expose a user-scoped
  health summary API.
- [x] Build 1.3 — Add reconciliation between provider balances and calculated
  transaction balances.
- [x] Build 1.4 — Add calculation lineage to net worth, score, cash flow, and
  investment metrics.

## 2. Durable automation

- [x] Build 2.1 — Introduce a durable background-job table and worker contract.
- [x] Build 2.2 — Make imports idempotent, resumable, and observable.
- [x] Build 2.3 — Add connection-health monitoring and consent-expiry handling.
- [x] Build 2.4 — Add operational alerts and backup/restore verification.

## 3. Transaction intelligence

- [x] Build 3.1 — Harden incremental transaction ingestion and pending-to-settled
  reconciliation.
- [x] Build 3.2 — Improve categorisation rules and learned suggestions.
- [x] Build 3.3 — Detect internal transfers, card repayments, refunds, and
  reversals.
- [x] Build 3.4 — Detect recurring income, bills, and subscriptions.

## 4. Historical truth

- [x] Build 4.1 — Add account reconciliation workflows and adjustments.
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
| 1.1 | Built 2026-07-30 | `node test/data-quality.test.js`; `npm run test:integrity-db`; `npm test` | `c62667b` |
| 1.2 | Built 2026-07-30 | focused data-quality/import tests; `npm run test:integrity-db`; `npm test` | `c45c455` |
| 1.3 | Built 2026-07-30 | reconciliation unit/service tests; `npm run test:integrity-db`; `npm test` | `02bcc98` |
| 1.4 | Built 2026-07-30 | lineage unit/service tests; `npm run test:integrity-db`; `npm test` | `559d350` |
| 2.1 | Built 2026-07-30 | worker unit tests; concurrent PostgreSQL contract; `npm test` | `1ba41fa` |
| 2.2 | Built 2026-07-30 | resumable import unit tests; PostgreSQL attempt-fencing contract; `npm test` | `f334cd3` |
| 2.3 | Built 2026-07-30 | connection-health unit tests; PostgreSQL tenant contract; `npm test` | `6f37013` |
| 2.4 | Built 2026-07-30 | resilience unit tests; PostgreSQL alert/run contract; `npm test` | `364e9b7` |
| 3.1 | Built 2026-08-02 | incremental-ingestion unit tests; PostgreSQL reconciliation contract; `npm test` | `adad782` |
| 3.2 | Built 2026-08-06 | categorisation and learned-suggestion unit tests; PostgreSQL feedback contract; client typecheck; `npm test` | `2a2b7ea` |
| 3.3 | Built 2026-08-06 | relationship detection tests; client typecheck; `npm test` | `176bc39` |
| 3.4 | Built 2026-08-06 | recurring transaction tests; client typecheck; `npm test` | `ec14d2f` |
| 4.1 | Built 2026-08-06 | `node test/reconciliation-adjustments.test.js`; `npm run test:integrity-db`; client `npm run typecheck`; `npm test` | `1370a2e`, `5d38951` |
