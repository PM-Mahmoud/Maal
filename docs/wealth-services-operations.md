# Wealth services activation and operations

Builds W2.1, W2.2 and W3.1 separate shipped software from approvals that HelloMaal
cannot self-certify.

## Methodology packs

The migration seeds lunar-year zakat, solar-year zakat and distribution-purification
packs as `pending_review`. Calculations remain available as clearly labelled educational
previews and record the pack/version on an immutable run. Production activation requires
a qualified reviewer to record their name, sources and review timestamp and change the
pack to `approved`. A ratio provider must also grant a suitable licence before its data is
loaded through the administrator-only licensed-ratio endpoint; user-supplied ratio/provider
claims are ignored. A ratio is evidence for a calculation, never a security endorsement.

## Curated partners

Set `PARTNER_ADMIN_USER_IDS` to a comma-separated allow-list of internal user IDs. The
admin API accepts a declared manifest, moves it into review, and separately approves and
enables it. Disabling a partner is the kill switch. User consent is limited to manifest
scopes and fields, expires within 365 days, is revocable, and produces append-only audit
events. Trade execution scopes are rejected.

The marketplace defaults to disabled. It can only be enabled by posting an approval and
`commercialTermsVersion` to `/api/v1/admin/marketplace-governance`. Sponsorship is stored
for disclosure but is not used by the ranking function.

These service/governance tables are intentionally not added to the generic `ASSET_TABLES`
CRUD allow-list. They have dedicated tenant-safe endpoints and append-only controls; generic
CRUD would bypass the review, consent and evidence invariants.

## Evidence and retention

`service_runs` and `service_run_lines` are append-only and tenant scoped. Downloadable
JSON evidence includes the exact input snapshot hash, methodology version and result.
Purification obligations remain after disposal and have append-only created/satisfied
events. Zakat runs schedule an annual reminder from their valuation date.
