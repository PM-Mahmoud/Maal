# Open banking provider call preparation

(codex) · HEL-74

Mahmoud books the call and records the answers in the private operating
manual. HEL-75 depends on the outcome. This plan uses provider roles so the
conversation and contract details stay private.

## Questions for the call

| Topic | Questions and evidence to request |
| --- | --- |
| Consumer Data Right participation | Which access and accreditation arrangements do you support for Maal? Who is responsible for consent, customer notices, complaints, data retention and incident reporting? What agreement and evidence do you require before going live? |
| Pricing and support | What are the setup charge, minimum commitment, usage unit and sandbox cost? How are retries, inactive connections and duplicate accounts counted? Who handles incidents and what are the response targets? |
| Sandbox and rollout | Which simulated institutions, account types and failure scenarios can we exercise? Can we test reauthorisation, stale consent and callback errors? What checklist, lead time and certification gates apply to production? |
| Hosted consent | Show the redirect out of Maal and the return callback. Which state, expiry and cancellation signals are available? Can users review their scopes, renew access or revoke it? What happens when consent expires at the institution? |
| Data and freshness | Which institutions, balances and transaction types are covered? How far back can Maal read, and how are pending items, reversals, amended descriptions and deleted accounts represented? Which identifiers are stable after renewal? |
| Updates and operational limits | Are signed events available, or should Maal poll? How do delivery retries, acknowledgements, pagination, rate limits, duplicate events and sequencing work? Request sample documentation for every event and error class. |
| Portability and security | Describe the migration and disconnect options and whether fresh user consent is required. What is the data retention and deletion process? Request sandbox data residency and security evidence for internal review. |

Ask for documentation and a sandbox walkthrough. Confirm the participation
and consent model with legal counsel before using real customer data.
[Consumer Data Right participation](https://www.cdr.gov.au/for-providers)

## Migration plan outline

### Compare the two data contracts

| Existing app concept | Candidate provider mapping to verify |
| --- | --- |
| Owner-scoped connection and encrypted tokens | Map the new provider's connection, subject and consent IDs into provider-scoped records. Verify refresh token rotation, consent status, revocation and expiry. Never put tokens in logs. |
| Canonical account link and account reference | Match on the stable candidate account ID scoped to connection and user. Keep legacy references and canonical account IDs intact. Require a deliberate matching decision for any ambiguous replacement account. |
| Institution, account type, balances and currency | Map provider values into existing account kinds and currency fields. Keep observed time and source. Test repayments, credit balances and liabilities separately using signed minor units. |
| Daily transaction import | Map posted and pending status, source IDs, signed amounts, currency, dates and descriptions. Fixture-test pagination, corrections, reversals, retry deduplication and account scope. |
| Import jobs, events and history | Map import lifecycle and opaque event IDs into the established worker and audit records. Verify event authenticity and make repeat delivery idempotent. Retain historical snapshots, labels and user edits. |

### Proposed rollout sequence

1. Record the provider's answers, then obtain approval to implement and
   agree on success and rollback conditions. Choose the supported consent
   and renewal model before designing customer copy.
2. Build a sandbox adapter and deterministic mapping fixtures. Use the
   existing import worker and canonical links. Keep new provider metadata
   in additive, owner-scoped records. Preserve the existing account and
   transaction schemas and make new migrations available for human review.
3. Test the welcome and connection paths with the hosted handoff, callback
   state, consent cancellation, refresh, revocation and sign-out. Keep
   imported accounts and history available across a successful reconnect.
   Review the history and deletion policy before wiring any disconnect.
4. Reconcile sandbox imports against expected account counts, balances,
   dates and transaction IDs. Test a repeat sync and the handling of
   unknown institutions, interrupted imports and duplicate events. Gate
   production enablement with provider, legal and internal approvals.
5. Start with a small, opted-in pilot and increase coverage after resolving
   mismatches. Keep the old connection's history and an auditable link to
   any replacement. For rollback, disable new enrolment and synchronisation,
   preserve both data histories and restore the prior supported flow where
   the user's consent still permits it.

Record which acceptance gates passed and who owns any decision to move
from sandbox to production on HEL-75.
