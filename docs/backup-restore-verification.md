# Backup restore verification

Build 2.4 verifies a restored PostgreSQL database; it never restores into or
writes to the primary database.

## Required deployment contract

1. `maal-backup-marker` advances `backup_source_markers` daily on the primary.
2. The database backup and restore automation must run after that marker job and
   restore into a dedicated, non-production PostgreSQL database.
3. `BACKUP_RESTORE_DATABASE_URL` must point to that restored database.
4. `maal-backup-verification` runs after the restore and requires the recovered
   marker to be no more than 30 hours old. A permanently stale restore fails.
5. `OPERATIONAL_ALERT_WEBHOOK_URL` must accept JSON `POST` requests. Delivery
   attempts, successes, and errors are retained with the alert ledger.

The verifier refuses a target with the same host, port, and database name as
`DATABASE_URL`. It opens a read-only transaction, checks the recovery marker,
migrations and required tables, and confirms that critical datasets are present
when they exist in the primary baseline.
