# Spec: Basiq account & transaction sync

Status: retrofit pilot for the agentic-engineering harness (see
`maal-agentic-engineering-sdlc.md` step 4). This documents the *current* behaviour of the
Basiq pull-sync flow as a contract, so future changes are checked against it rather than
against "does it look right."

Code: `services/basiq.js`, `routes/basiq.js`, `lib/basiq-mapping.js`, `db/linked_accounts.js`,
`db/transactions.js`. Data-flow narrative: `docs/architecture.md`.

## Scope

This spec covers the deterministic, testable parts of the sync: mapping a raw Basiq API
response into the shape Maal persists, and the HTTP error-handling contract in
`basiqFetch()`. It does not cover the live network calls themselves (mocked in tests) or the
Basiq-hosted consent UI (out of Maal's code entirely).

## Contract: account mapping (`mapBasiqAccount`)

Given one account object from `GET /users/:id/accounts` (Basiq v3 shape:
`{ id, name, institution, class: { type }, balance }`), produce the row shape
`addAccount()` expects:

- `account_reference` MUST be `'basiq:' + acc.id` — this prefix is how `syncAccountsToDb`
  identifies (and later deletes/replaces) previously-synced Basiq rows on the next sync. It
  MUST NOT collide with manually-added accounts, which never carry this prefix.
- `institution_name` MUST strip the literal substring `'AU'` from `acc.institution` if
  present (matches existing Basiq sandbox data like `'HoolibankAU'` -> `'Hoolibank'`); if
  `acc.institution` is absent, fall back to `acc.name`; if both are absent, fall back to the
  literal string `'Bank account'`. Never null/undefined.
- `institution_type` MUST be `acc.class.type` if present, else the literal string `'bank'`.
  Never null/undefined.
- `balance` MUST be `Math.round(Number(acc.balance) || 0)` — always a finite integer, even if
  `acc.balance` is a non-numeric string, missing, or `NaN`. This guards the "Postgres BIGINT
  returns as string" class of bug at the boundary where external data enters the app.

## Contract: transaction mapping (`mapBasiqTransaction`)

Given one transaction object from `GET /users/:id/transactions` (Basiq v3 shape:
`{ id, description, subClass: { title }, amount, status, postDate, transactionDate }`),
produce the row shape `upsertBasiqTransactions()` expects:

- Transactions with a falsy `id` MUST be skipped entirely (no row written) — `id` is the
  upsert conflict key (`transactions.basiq_id UNIQUE`); a null/undefined id would either
  throw or collide across users.
- `post_date` MUST be the first 10 characters (`YYYY-MM-DD`) of `postDate`, falling back to
  `transactionDate` if `postDate` is absent, and MUST be `null` (not `''` or `undefined`) if
  neither is present — `transactions.post_date` is a Postgres `DATE` column and an empty
  string is not a valid date literal.
- `description` MUST fall back through: `t.description` -> `t.subClass.title` -> `''`, and
  MUST be truncated to 500 characters (`transactions.description` has no DB-level length
  cap, so this is an application-level guard against unbounded Basiq payloads).
- `amount` MUST be `Number(t.amount) || 0` — same non-numeric/NaN guard as account balance.
- `status` passes through as-is, defaulting to `null` if absent.

## Contract: `basiqFetch` error handling

- A non-2xx response MUST throw an `Error` whose message includes the HTTP status code and
  the request path (format: `` Basiq {status} on {path}: {detail} ``), so error logs are
  traceable back to the failing call without needing to reproduce it.
- If the response body is valid JSON and contains a Basiq-shaped error
  (`data[0].detail`), that detail string MUST be used as the error's trailing detail.
- If the body isn't that shape (or isn't JSON at all), the first 200 characters of the raw
  response text MUST be used as the trailing detail instead — this must never throw a
  secondary error while trying to construct the primary one (e.g. `JSON.parse` failure on a
  non-JSON error body must be caught, not left to crash the request).

## Non-goals (explicitly out of scope for this spec)

- Basiq webhook signature verification — **does not apply**. Maal has no webhook receiver;
  sync is entirely pull-based, triggered by the user's browser hitting `/basiq/callback` or
  `/basiq/sync`. If a webhook receiver is added in future, it needs its own spec.
- Consent state-machine transitions — consent lives inside Basiq's hosted UI, not in a local
  table Maal can unit test.
- `syncAccountsToDb()`'s DB orchestration (delete-then-insert, DB writes) — this requires a
  live or mocked Postgres connection and is integration-level, not unit-level; it is
  exercised indirectly by the existing `/basiq/sync` route in manual sandbox testing, not by
  `test/basiq-sync.test.js`.
