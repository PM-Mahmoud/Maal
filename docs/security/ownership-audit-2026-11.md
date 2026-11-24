# Maal ownership audit, November 2026 (codex)

The audit follows the signed-in user from the API handler to each persistence
layer. Private queries use that identity as a bound SQL value, either directly
on the row or through its parent. Shared access and worker operations have
their own authority, described below. The release leaves the schema intact.

## Changes

| Area | Ownership rule after review |
| --- | --- |
| Onboarding sessions and answers | Step reads require sign-in. Reads and writes use the session owner's ID in SQL. Writes outside the caller's scope return the same response as an unavailable session. Ownerless answers remain readable through an owned session for compatibility. Answers with a conflicting owner are excluded. |
| Manual-asset API | All spellings of the owner column are excluded from client writes. Inserts set the owner from the authenticated session. Updates and deletes retain the owner predicate. |
| Recurring items | A transaction reference is optional. If supplied, the insert or upsert can link only to a transaction owned by the actor. An unavailable transaction returns 404. |
| Cash-flow forecast | Category joins require the same owner as the parent transaction. |
| Advisor messages | The legacy append path uses the atomic, owner-scoped thread writer. Legacy reads also join to the owned parent. |
| Research jobs and reports | Job phase and result updates bind the actor who created the job. A completed job can reference only a report for that actor. |
| Radar runs and events | Updates and event inserts use the radar owner's ID, including when triggered by the scheduler. |
| Linked accounts | The legacy status update has the same owner predicate as the existing sync and delete helpers. |
| Imports and background jobs | Import queries check that the job and run share an owner in addition to the existing worker lease checks. |

## Ownership inventory

The review covered table declarations under `migrations/`, SQL in `db/`,
and request paths in `routes/api.js` and their mounted routers. The groups below
capture the boundaries for related tables and queries.

| Area | Tables and query entry points | Authority |
| --- | --- | --- |
| Identity and device sessions | `users`, `session`, `user_trials`, `usage_counters`. `db/users.js`, `db/auth.js`, `db/sessions.js`, `db/trials.js`, `db/usage.js` | The session actor, verified credential, or verified billing linkage identifies the user. Device reads and revocations are scoped to that user. |
| Onboarding and personal profile | `onboarding_sessions`, `onboarding_responses`, `user_profiles`, `user_widgets`. `db/onboarding.js`, `db/profiles.js`, `db/risk-profile.js`, `db/widgets.js` | Actor ID on profile and session rows, with answers scoped by their parent. |
| Assets, debts and accounts | `cash_accounts`, `investments`, `properties`, `debts`, `super_accounts`, `incomes`, `other_assets`, `linked_accounts`, `account_net_worth_snapshots`, `net_worth_snapshots`. `db/assets.js`, `db/linked_accounts.js`, `db/account-snapshots.js`, `db/snapshots.js`, asset API | Actor ID on reads and mutations. Rollups apply the same user filter to their inputs. |
| Transactions and spending | `transactions`, `transaction_categories`, `transaction_category_feedback`, `transaction_rules`, `transaction_manual_accounts`, `transaction_meta`, `transaction_tags`, `transaction_splits`, `tags`, `budgets`, `spending_settings`, `spending_custom_categories`, `spending_category_groups`, `spending_category_group_members`, `recurring_items`, `report_views`. `db/transactions.js`, `db/transaction-detail.js`, `db/budgets.js`, `db/spending-categories.js`, `db/recurring-items.js`, `db/reports.js`, spending API | Actor ID on transaction and settings reads and writes. Transaction children are scoped directly or through an owned account or transaction. |
| Planning and financial review | `goals`, `financial_plans`, `financial_plan_snapshots`, `financial_scores`, `maal_score_snapshots`, `recommendations`, `recommendation_events`, `recommendation_outcomes`, `monthly_financial_closes`, `account_reconciliations`, `account_reconciliation_adjustments`, `data_quality_runs`, `data_quality_findings`, `calculation_audits`, `calculation_audit_sources`. `db/goals.js`, `db/planning.js`, `db/scores.js`, `db/score-snapshots.js`, `db/recommendations.js`, `db/recommendation-actions.js`, `db/monthly-close.js`, `db/reconciliation.js`, `db/financial-integrity.js`, analytics and export modules | Actor ID on planning and analysis records and on financial inputs. Dependent rows inherit the relevant user's run, audit or reconciliation. |
| Connected accounts and import evidence | `financial_accounts`, `canonical_account_links`, `provider_connections`, `provider_connection_health`, `provider_connection_events`, `transaction_provider_details`, `transaction_sync_cursors`, `raw_financial_records`, `holdings`, `ownership_interests`, `valuations`, `import_runs`, `wealth_statement_imports`, `background_jobs`. Connection, canonical-wealth and import query modules | The provider account resolves to the app user before ingest. The import actor or worker lease controls access. Financial evidence is scoped to the user and its owning record. |
| Advisor, research and alerts | `advisor_sessions`, `advisor_messages`, `advisor_message_feedback`, `advisor_memory`, `research_reports`, `research_jobs`, `radars`, `radar_events`, `vault_files`. `db/advisor.js`, `db/advisor-memory.js`, `db/research.js`, `db/radar.js`, `db/vault.js`, their API handlers | Actor ID on private rows. Messages and radar events use the owning parent. Jobs and sends carry the submitting user's identity. |
| Sharing and extensibility | `households`, `household_members`, `access_grants`, `supporting_documents`, `activity_ledger`, `notifications`, `api_tokens`, `automation_rules`, `automation_rule_runs`, `webhooks`, `webhook_deliveries`. `db/collaboration.js`, `db/extensibility.js` | The owner, active membership or active grant controls access. Invitation acceptance binds the recipient identity. API token authentication uses the credential hash and scope. Child runs and deliveries inherit the rule or webhook owner. |
| Wealth services and partner access | `service_runs`, `service_run_lines`, `service_reminders`, `purification_obligations`, `purification_obligation_events`, `partner_consents`, `partner_audit_events`, `partner_usage_events`. `db/wealth-services.js`, `db/partner-platform.js` | Actor or verified partner credential with consent bounds each operation. Run lines and events inherit the parent owner. |
| Community and referrals | `feedback`, `roadmap_items`, `roadmap_votes`, `referral_codes`, `referrals`, `referral_rewards`, `score_submissions`, `waitlist_emails`. Corresponding query modules | Public or signed-in collection and catalogue reads by design. Per-user vote, referral and reward operations bind the actor or a validated referral relationship. Operational reads use the administrative path. |
| Shared catalogue and operations | `instruments`, `knowledge_chunks`, `market_briefs`, `marketplace_governance`, `methodology_packs`, `purification_ratio_datasets`, `partner_registry`, `radar_templates`, `recommended_tools`, `operational_alerts`, `backup_source_markers`, `backup_verification_runs` | Global reference data uses domain identifiers. Operational queries are invoked by the service or worker. |

Recurring runs due for delivery, boot-time research job recovery, retention and
backup work, and job leasing intentionally span users. A due record carries
its owner into subsequent customer-specific writes. Collaboration authorizes
delegated access through stored grants and membership. These boundaries should
be kept explicit when adding new callers.

The ownership regression test checks bound actor parameters and the onboarding
auth guard and denial path. Existing transaction and advisor suites cover
their normal operations.
