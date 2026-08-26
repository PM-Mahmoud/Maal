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
- [x] Build 4.2 — Produce reliable daily net-worth snapshots.
- [x] Build 4.3 — Explain material changes between snapshots.
- [x] Build 4.4 — Calculate investment performance independently of deposits.

## Priority programme — Complete wealth and services platform (NEXT)

Implementation plan: [HelloMaal wealth platform implementation plan](./wealth-platform-implementation-plan.md)

- [x] Build W1.1 — Replace the single asset destination with a My Wealth information
  architecture: Overview, Cash, Investments, Property, Super, Liabilities and Other
  Assets, with matching desktop/mobile navigation and reconciled totals.
- [x] Build W1.2 — Add canonical financial accounts, instruments, holdings, valuations,
  ownership, and source/as-of/confidence metadata with a compatibility migration from
  the existing seven asset tables.
- [x] Build W1.3 — Add reliable broker/super statement imports and a provider-adapter
  contract with explicit scopes, durable syncs, lineage, health and revocation.
- [x] Build W2.1 — Deliver a versioned, explainable zakat calculator against an immutable
  wealth snapshot, with user-confirmed classifications and downloadable evidence.
- [x] Build W2.2 — Deliver a versioned listed-investment purification workflow with
  security/distribution-level calculations, licensed data provenance and obligation history.
- [x] Build W3.1 — Add a curated partner registry, consent and audit controls; launch a
  product marketplace only after the regulatory and commercial operating model is approved.

Activation note (2026-08-09): the product and governance controls are built. The seeded
zakat and purification methodology packs intentionally remain `pending_review` until a
qualified reviewer approves them. The partner marketplace intentionally remains disabled
until an administrator records the approved regulatory and commercial terms version.

## 5. Forecasting and reporting

- [x] Build 5.1 — Forecast account balances from recurring cash flows.
- [x] Build 5.2 — Detect likely cash shortfalls and upcoming obligations.
- [x] Build 5.3 — Generate immutable monthly financial-close reports.
- [x] Build 5.4 — Add complete CSV/JSON financial exports.

## 6. Planning

- [x] Build 6.1 — Add goal feasibility and required-contribution calculations.
- [x] Build 6.2 — Add emergency-fund coverage calculations.
- [x] Build 6.3 — Add debt avalanche, snowball, and custom payoff plans.
- [x] Build 6.4 — Track plan progress and outcomes.

## 7. Scenarios and recommendations

- [x] Build 7.1 — Add isolated, non-destructive scenario modelling.
- [x] Build 7.2 — Add transparent financial-health rules.
- [x] Build 7.3 — Rank actions by impact, urgency, confidence, and effort.
- [x] Build 7.4 — Track recommendation completion and measured outcomes.

## 8. Collaboration and compliance

- [~] Build 8.1 — Add household membership and ownership boundaries. The server-side
  slice now creates owner-led households, member records, bounded ownership shares,
  and owner-only member management. Binding every canonical asset/ownership interest
  to a household and adding the first-party UI remain.
- [x] Build 8.2 — Add scoped, read-only accountant/adviser access. Grants are pending
  until accepted, expire safely, can be revoked immediately, and expose only explicit
  overview, transaction, document, or tax-export read scopes.
- [x] Build 8.3 — Add tax-ready exports and supporting-document links. Vault files can
  be linked to a tax year/entity only by their owner; shared document downloads and
  Australian FY-bounded tax exports enforce the grant scope.
- [x] Build 8.4 — Add complete data portability and deletion workflows. Portable JSON/CSV
  exports include the user's collaboration records, and account deletion requires an
  explicit confirmation phrase before the existing cascade removes the account.

Build 8 server-side delivery (2026-08-27): collaboration endpoints are live under
`/api/v1/collaboration/*`, `/api/v1/data-portability`, and `/api/v1/account/deletion`.
All reads and mutations are tenant-scoped in SQL; membership alone does not reveal a
member's financial records. The remaining release work is canonical household-to-asset
assignment, household-aware totals/calculations, and a Settings/Collaboration UI.

## 9. Extensibility

- [x] Build 9.1 — Add a reusable notification service and preferences.
- [x] Build 9.2 — Generalise automation into an event/condition rules engine.
- [x] Build 9.3 — Add a complete activity ledger for sensitive operations.
- [x] Build 9.4 — Add scoped API tokens and webhooks.

Build 9 delivery (2026-08-27): the server-side extensibility slice is complete. It provides
user-scoped notification read/acknowledgement and preference APIs; validated event types and
condition rules with idempotent notification actions; append-only activity records and reads;
read/write/export/webhooks API-token scopes; and signed, timestamped, idempotent outbound
webhook deliveries. Financial exports emit an audited `export.created` event. The reusable
event publisher is available to import/sync/service code through `services/extensibility.js`.

Remaining follow-up is deliberately outside this build slice: a first-party Settings UI for
token/rule/webhook management, a durable retry worker and delivery backoff, email/push channel
fan-out, and wiring every existing domain mutation to an event (the shared publisher is ready
for those call sites).

## Build log

| Build | Status | Verification | Commit |
|---|---|---|---|
| W1.3 | Built 2026-08-07 | `npm run test:wealth-platform`; client typecheck; `npm test`; adapter, durable sync/progress, health, lineage and revocation | This commit |
| W1.2 | Built 2026-08-07 | `npm run test:wealth-platform`; performance tests; `npm test`; canonical imports, linking, FX/ownership, freshness, allocation, performance and exports | This commit, `b43952b` |
| W1.1 | Built 2026-08-07 | `node test/assets-summary.test.js`; client `npm run typecheck`; client `npm run build`; `npm test` | This commit |
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
| 4.2 | Built 2026-08-07 | `node test/daily-snapshots.test.js`; `npm run test:integrity-db`; client `npm run typecheck`; `npm test` | `dcc27b7`, `e6b0191` |
| 4.3 | Built 2026-08-07 | `node test/snapshot-changes.test.js`; client `npm run typecheck`; `npm test` | `46bfc2b`, `e6b0191` |
| 4.4 | Built 2026-08-07 | `node test/investment-performance.test.js`; `npm run test:integrity-db`; client `npm run typecheck`; `npm test` | `3b1b79e`, `e6b0191` |
| 5.1 | Built 2026-08-07 | `node test/cashflow-forecast.test.js`; client `npm run typecheck`; `npm test` | `48c6839`, `7c90d81` |
| 5.2 | Built 2026-08-07 | `node test/cash-risks.test.js`; client `npm run typecheck`; `npm test` | `c76a6e7`, `7c90d81` |
| 5.3 | Built 2026-08-07 | `node test/monthly-close.test.js`; `npm run test:integrity-db`; client `npm run typecheck`; `npm test` | `2464f6d`, `7c90d81` |
| 5.4 | Built 2026-08-07 | `node test/financial-export.test.js`; client `npm run typecheck`; `npm test` | `37aa534`, `7c90d81` |
| 6.1 | Built 2026-08-07 | `npm run test:planning`; client build/typecheck; `npm test` | `79b41bb` |
| 6.2 | Built 2026-08-07 | `npm run test:planning`; client build/typecheck; `npm test` | `79b41bb` |
| 6.3 | Built 2026-08-07 | `npm run test:planning`; client build/typecheck; `npm test` | `79b41bb` |
| 6.4 | Built 2026-08-07 | `npm run test:planning`; client build/typecheck; `npm test` | `79b41bb` |
| 7.1 | Built 2026-08-07 | `npm run test:scenarios`; client build/typecheck; `npm test` | `db0253c` (`origin/codex/build-7-scenarios`) |
| 7.2 | Built 2026-08-07 | Maal Score and lineage tests; client build/typecheck; `npm test` | `6c587cc` |
| 7.3 | Built 2026-08-07 | recommendation action tests; client build/typecheck; `npm test` | `5a92b35` |
| 7.4 | Built 2026-08-07 | recommendation lifecycle/outcome tests; client build/typecheck; `npm test` | `5a92b35`, `277c6ac` |
| 8.1 | Server slice built 2026-08-27 | `npm run test:collaboration`; optional local PostgreSQL contract `npm run test:collaboration-db` | This commit |
| 8.2 | Built 2026-08-27 | `npm run test:collaboration`; route registration and grant-scope contract | This commit |
| 8.3 | Built 2026-08-27 | `npm run test:collaboration`; FY-bounded tax export and same-user Vault-link contract | This commit |
| 8.4 | Built 2026-08-27 | `npm run test:collaboration`; portability endpoint and deletion-confirmation contract | This commit |
| 9.1 | Built 2026-08-27 | `node test/extensibility.test.js`; notification APIs/preferences, rule notifications and event publisher | This commit |
| 9.2 | Built 2026-08-27 | `node test/extensibility.test.js`; event/condition validation, idempotent rule runs and notification actions | This commit |
| 9.3 | Built 2026-08-27 | `node test/extensibility.test.js`; append-only activity writes/reads and sensitive-operation audit calls | This commit |
| 9.4 | Built 2026-08-27 | `node test/extensibility.test.js`; scoped tokens, export authorization, HMAC webhooks and delivery deduplication | This commit |
