# HelloMaal wealth platform implementation plan

## Outcome

Make HelloMaal the household's financial system of record: one reconciled view of cash,
superannuation, property, listed investments, private assets and liabilities, with trusted
services that can operate on that data. The first services are zakat calculation and listed-
investment purification; later services may include product discovery and partner workflows.

This extends the existing product rather than replacing it. HelloMaal already has seven
asset/liability tables, a 12-category React portfolio screen, Basiq bank ingestion, investment-
performance calculations, daily snapshots, lineage and data-quality infrastructure.

## Product principles

1. **The register is the source of truth.** Every total, chart, calculation and service reads
   from the same canonical accounts, holdings, assets and liabilities. Chat can explain data,
   but must not maintain a competing copy.
2. **Source and confidence are visible.** A value says whether it is connected, imported,
   manually entered or calculated, when it was observed and whether it is stale.
3. **A service is not automatically a plugin.** Build high-trust core calculations in
   HelloMaal. Use partner integrations for specialist data, execution or regulated products.
4. **No silent financial judgement.** Zakat and purification outputs show the selected
   methodology, valuation date, inputs, exclusions, assumptions and calculation lineage.
5. **Read-only first.** Do not add money movement, brokerage execution or product application
   flows until licensing, consent, partner and operational obligations are deliberately met.

## Information architecture

Rename **My Portfolio** to **My Wealth** and make it the primary sidebar group:

- Overview — net worth, allocation, freshness and incomplete-data prompts.
- Cash — bank, savings and term-deposit accounts.
- Investments — brokerage accounts and holdings; stocks, ETFs, funds and crypto are filters
  inside the page rather than separate permanent menu items.
- Property — each property with valuation, ownership, mortgage, rent and linked documents.
- Super — funds, balances, contributions, investment options and beneficiary checklist.
- Liabilities — mortgages, cards, personal debt, tax and other obligations.
- Other assets — private investments, businesses, precious metals, vehicles and collectibles.
- Transactions, Goals and Vault — retain the existing destinations.

Add a separate **Services** group:

- Zakat
- Purification
- Product marketplace (only after the governance and commercial work in Phase 5)
- Calculators (the existing super, tax, debt and scenario tools)

Desktop and mobile should use the same structure. Rare subclasses stay as filters or cards
within their parent page. This gives each major class a clear home without turning the sidebar
into the entire data taxonomy.

## Canonical data model

The current table-per-class model is enough for the first navigation release, but not for
multiple broker accounts, instrument-level positions and reusable partner services. Evolve it
incrementally; do not perform a big-bang migration.

- `financial_accounts`: institution/provider containers such as bank, brokerage, super,
  crypto-wallet and loan accounts.
- `instruments`: reusable security/product identity (ticker, ISIN/APIR where available,
  exchange, currency and asset classification).
- `holdings`: dated quantity and cost basis of an instrument within a financial account.
- `valuations`: append-only observed or estimated values with source, as-of time, currency and
  confidence. Property and illiquid assets use valuations even without holdings.
- `ownership_interests`: person/household ownership percentage and ownership structure.
- `provider_connections`: provider, consent scopes, health and sync cursor; secrets/tokens are
  referenced through encrypted storage and never returned to the client.
- `service_runs`: immutable request/result envelope for zakat, purification and future
  services, including methodology/version, input snapshot, provider, status and lineage.

Keep current asset tables as compatibility projections while screens and calculations migrate.
Every query remains user-scoped. Store money in minor units plus ISO currency; do not treat all
values as AUD or round security quantities.

## Integration architecture

Use a curated service-platform model before considering an open third-party plugin runtime.
Arbitrary third-party code handling financial data would create unnecessary security, privacy
and support risk.

Each server-side integration adapter supplies:

- a manifest with provider, service type, region, required scopes and methodology/version;
- explicit user consent for the minimum fields and duration;
- canonical snapshot-to-request and response-to-normalized-result mappings;
- synchronous execution or a durable job with an idempotency key;
- timeouts, retries, circuit breaking, audit events and revocation/deletion hooks.

The browser never receives partner credentials. Partners receive only the approved snapshot,
and every outbound field is recorded. Webhooks require signature verification, replay
protection and tenant-safe correlation. Reuse existing jobs, lineage, data quality and
connection-health modules.

## Build versus partner

| Capability | Initial approach | Reason |
|---|---|---|
| Zakat calculation | Build core engine; optional scholar/methodology packs | Deterministic, explainable and testable from canonical assets |
| Stock purification | Hybrid: HelloMaal workflow and ledger; licensed specialist ratios/methodology where needed | Requires issuer data and methodology governance |
| Brokerage aggregation | Partner/import adapters, then direct providers where viable | Authentication, identifiers and refresh reliability are provider-specific |
| Super aggregation | Manual/statements first; investigate data-access partners | Open banking does not make all super data available |
| Property valuation | Manual/statement first; optional valuation-data partner | Estimates need provenance, date and confidence |
| Investment products | Curated marketplace/referral first | Execution and personal recommendations can trigger licensing obligations |

## Delivery phases

### Phase 1 — Wealth navigation and completeness (next release)

- Introduce My Wealth routes for the six major classes.
- Reuse existing category CRUD and APIs; deep-link/filter the asset screen before splitting
  components into class-specific pages.
- Add overview completeness, last-updated and source badges.
- Add super to the React catalogue (it exists in the backend but is absent from the catalogue).

**Exit:** users can find, add and edit every class; all totals reconcile to the overview and
net-worth snapshot; desktop and mobile navigation match.

### Phase 2 — Canonical accounts, holdings and valuations

- Add the shared records above with tenant-safe query modules and append-only raw inputs.
- Backfill idempotently from existing asset tables and run parity checks.
- Add CSV/statement import for broker holdings and super before waiting for every provider API.
- Add duplicate matching, account linking, valuation freshness and override history.
- Migrate net worth, allocation, performance and exports to canonical read models.

**Exit:** institutions can contain multiple accounts and holdings; every amount has source and
as-of metadata; legacy and canonical totals reconcile in automated tests.

### Phase 3 — Zakat service MVP

- Define versioned methodology packs with a qualified Islamic-finance reviewer: eligibility,
  nisab basis, lunar/solar rate, debt treatment, ownership and valuation-date rules.
- Pre-fill eligible assets but require confirmation of disputed classifications/exclusions.
- Persist immutable runs, lines and evidence; produce a downloadable report and annual reminder.

**Exit:** golden cases cover cash, stocks, super accessibility, property intention, business
inventory, debts, joint ownership and currencies; stored snapshots reproduce every total.

### Phase 4 — Listed-investment purification MVP

- Model distributions, holding periods, disposal dates and purification obligations.
- Contract a financial-data/methodology provider or document licensed datasets for an internal
  implementation.
- Show security-level status, methodology, period, impure-income ratio, amount due, unavailable-
  data warnings and history.
- Let users record satisfaction/disposal of an obligation; do not equate a ratio with endorsement.

**Exit:** results are versioned and reproducible; corporate actions and missing ratios fail
visibly; portfolio totals drill down to every security/distribution line.

### Phase 5 — Partner platform and product marketplace

- Build an internal integration registry and admin approval workflow using the adapter contract.
- Add service consent, scopes, entitlements, metering, audit logs and partner health.
- Launch curated partners only; add sandbox certification and kill switches before broadening.
- Separate education/filtering, general advice, personal advice, referral and execution. Obtain
  Australian legal/compliance advice on AFSL, Design and Distribution Obligations, disclosure,
  conflicts, commissions, privacy and CDR implications before lead collection or individual
  product ranking.
- Disclose commercial relationships; sponsored placement cannot affect suitability ranking.

**Exit:** partners can be disabled without a deploy, sharing is inspectable/revocable, failures
cannot corrupt canonical records and product experiences match the approved operating model.

## Cross-cutting work

- Household ownership/permissions are prerequisites for accurate joint property, spouse assets
  and zakat; coordinate with roadmap Build 8.1.
- Store original currency plus valuation FX source/time and AUD presentation.
- Apply encryption, least-privilege scopes, retention/deletion propagation, vendor due diligence
  and a complete sensitive-operation ledger.
- Require reconciliation invariants, provider contract tests, golden calculation fixtures,
  migration parity checks and stale-data alerts.
- Start with subscription value. Affiliate/referral revenue must be disclosed and cannot
  influence calculations or personalised ranking.
- Use **service integration** for executable workflows and **marketplace listing** for outbound
  product/referral cards. Reserve **plugin** for a future sandboxed extension mechanism.

## Measures of success

- Active users with at least two wealth classes and a complete net-worth baseline.
- Wealth value refreshed within class-specific freshness targets.
- Reconciliation exceptions per sync/import and median time to resolve.
- Completed zakat/purification runs, warning rate, downloads and repeat annual use.
- Partner-run success/latency, consent revocations, deletion completion and support rate.
- Zero unexplained differences between class totals, overview, service inputs and exports.

## Explicitly deferred

- An open app store or arbitrary third-party code execution.
- Trading, transfers, custody or automated purification/zakat payments.
- Personalised product recommendations without the required licensing and governance.
- Credential scraping or brittle browser automation for brokers, super funds or property portals.
