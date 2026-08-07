# Lunch Flow integration plan

Lunch Flow is an additional financial-data provider. Basiq remains enabled and
independent throughout this work.

## Implemented foundation

- [x] Read Platform API credentials from server-side environment variables.
- [x] Add OAuth connect and callback routes with session-bound state validation.
- [x] Encrypt per-user access and refresh tokens at rest.
- [x] Refresh expiring tokens and retry once after an unexpected HTTP 401.
- [x] Add bounded provider request timeouts.
- [x] Read accounts, balances, and posted/pending transactions.
- [x] Store provider-scoped account and transaction references (`lunchflow:*`).
- [x] Add independent Lunch Flow status, connect, and sync controls beside Basiq.
- [x] Keep Lunch Flow balances out of canonical net-worth totals until provider
      reconciliation prevents double counting and account types are known.

## Next slices

- [ ] Add a provider-link/canonical-account reconciliation model so one real
      account connected through Basiq and Lunch Flow contributes only once.
- [ ] Classify depository, credit/loan, super, and brokerage accounts before
      promoting balances into canonical wealth tables.
- [ ] Import holdings into investment positions with valuation provenance.
- [ ] Move synchronization onto the existing durable import/background-job
      framework, including cross-instance locking, retries, and progress UI.
- [ ] Define and implement a stale-transaction retention/reconciliation policy.
- [ ] Add an explicit disconnect/re-authorize flow and provider-specific health.
- [ ] Add database integration tests for encrypted token and import persistence.
- [ ] Validate the production OAuth flow and supported Australian institutions
      with non-sensitive test accounts.

## Required production environment

- `LUNCHFLOW_CLIENT_ID`
- `LUNCHFLOW_CLIENT_SECRET`
- `PROVIDER_TOKEN_ENCRYPTION_KEY` (stable random secret, separate from sessions)
- `LUNCHFLOW_REDIRECT_URI` (optional; defaults to the canonical Maal callback)
