# Maal deployment guide

Render runs the Node.js web service and import worker against PostgreSQL. `render.yaml` declares the build commands and process entry points. Use Node 20 as specified in `package.json`.

## Render services

Configure the web service from this repository with `main` as its deploy branch.

| Setting | Value |
| --- | --- |
| Build command | `npm install && npm run migrate && npm run build:client` |
| Start command | `npm start` |
| Health check | `/health` |

The build runs pending database migrations and builds the React client and its route manifest. The import worker and backup jobs have their own commands and environment settings in `render.yaml`.

## Web service environment

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Set to `production` by the blueprint |
| `DATABASE_URL` | PostgreSQL connection string from Neon |
| `SESSION_SECRET` | Random secret for signing session cookies |
| `BASE_URL` | Canonical public HTTPS origin used by checkout and auth links |
| `PUBLIC_TERMS_LINKS` | Set to `1` only after counsel approves the Terms text and the reviewed copy is deployed. The default keeps links hidden and the draft excluded from indexing. |
| `PORT` | Assigned by Render |
| `RESEND_API_KEY` | Sends transactional email through Resend |
| `EMAIL_FROM` | Verified sender address for signup, password reset and other transactional email |
| `FEEDBACK_EMAIL` | Team inbox for in-app feedback and support notifications. Set this to the team feedback alias. If unset, the app saves submissions to the database and skips the notification email |
| `BASIQ_API_KEY` | Enables bank consent and synchronisation. Set it on both the web service and import worker when bank connections are enabled |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Membership checkout and webhook verification when Stripe is enabled |
| `EXA_API_KEY` | Web grounding for research and radar when enabled |

Set environment values in Render. Keep credentials out of the repository. See the private Maal Operating Manual for account access and operating costs.

## Deploy and verify

For an authorised release, commit the verified source and any generated client bundle, then merge the reviewed pull request to `main`. Render deploys automatically. Check the build logs for successful migrations and client build, then confirm `/health` returns HTTP 200 and `status: healthy`. Check the landing page and any affected routes. A failed build leaves the previous version serving, so confirm the deployed commit in Render or verify a release-specific change on the live site before reporting the build complete.

## Local development

Use a disposable local PostgreSQL database for migrations and sandbox credentials for integrations. Set `DATABASE_URL`, `SESSION_SECRET`, and `BASE_URL` in your shell.

```bash
npm ci --ignore-scripts
npm run migrate
npm run build:client
npm run dev
```

`npm run build:client` installs the client dependencies before building.

For a database-free preview with mock data, run `node scripts/preview-static.js`.

## Object storage for Vault (Cloudflare R2 / S3)

Vault stores uploaded documents as raw `bytea` in Postgres **by default**. That
works, but every upload/download pushes the full file through Neon and counts
against its transfer allowance. Setting the required `STORAGE_*` env vars switches
Vault to S3-compatible object storage (Cloudflare R2 recommended — zero egress).

`GET /health` reports `objectStorage: true` when storage is configured
(`services/storage.js` `isConfigured()`):

| Variable | Example | Notes |
|----------|---------|-------|
| `STORAGE_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | R2 account endpoint |
| `STORAGE_BUCKET` | `maal-vault` | Keep the bucket **private** |
| `STORAGE_ACCESS_KEY_ID` | *(from R2 token)* | Use an **Account** API token, scoped to the bucket, Object Read & Write |
| `STORAGE_SECRET_ACCESS_KEY` | *(from R2 token)* | Shown once at token creation |
| `STORAGE_REGION` | `auto` | Optional, defaults to `auto`. Set the actual region for AWS S3. |

Notes:
- **Coexistence is automatic.** Existing `bytea`-stored files keep working; only
  *new* uploads go to object storage (`db/vault.js` reads by `storage_key` else
  `content`). No backfill needed.
- **Fail-safe fallback.** If required variables are missing, `isConfigured()` returns
  false and Vault silently reverts to `bytea` — a misconfig won't break uploads.
  If uploads start failing *after* you set the vars, suspect a bad
  credential/endpoint/bucket, not the fallback.
- Set the vars on the **`app`** service (it serves uploads/downloads). Add them to
  the worker only if it touches Vault files. Prefer a **no-expiry** token (or a
  rotation reminder) — an expired token silently drops back to `bytea`.

---

## Migration gotchas

`migrate.js` loads **every `*.js` file** in `migrations/` (`.filter(f => f.endsWith('.js'))`),
runs each once, and records it in the `_migrations` table. Two traps have bitten
real deploys:

1. **Duplicate migration files fail (or bloat) deploys.** macOS/iCloud creates
   "conflicted copy" duplicates like `1756200000000_build9_extensibility 3.js`.
   `migrate.js` treats each as a *separate* migration and runs it. If a migration
   is idempotent (`CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP TRIGGER
   IF EXISTS`) the duplicate is a harmless no-op — but a non-idempotent copy will
   **fail the whole deploy**. These duplicates are now blocked by `.gitignore`
   (`* [0-9].*`). To find any that slipped in: `git ls-files | grep -E ' [0-9]+\.'`.

2. **`ON CONFLICT DO UPDATE` referencing `EXCLUDED.<col>` for a column not in the
   INSERT's column list** raises `column excluded.<col> does not exist` — and it's
   a *plan-time* error, so it fails even when no conflict occurs. This blocked
   every deploy after the canonical-wealth backfill until fixed (the `holdings`
   upsert was setting ownership columns that live on `ownership_interests`, not
   `holdings`). Lesson: an `EXCLUDED.x` reference is only valid when `x` is one of
   the inserted columns.

**Verifying a deploy actually applied the migrations** (not just that the app is
up — a failed migration keeps the *previous* build serving):
```sql
SELECT name, applied_at FROM _migrations ORDER BY applied_at DESC LIMIT 20;
```
Confirm the expected migrations are present, with recent `applied_at`, and that
there are **no** duplicate `..._name 2` / `..._name 3` rows.

## Enable knowledge search on a metadata-only database

Run `CREATE EXTENSION IF NOT EXISTS vector;` as a database role with extension
permissions. Then run `npm run migrate` against that database. If the migration
runner already recorded the restoration migration during a plain Postgres deploy,
run its idempotent upgrade explicitly from the repository root with the same
database connection settings:

```sh
node - <<'NODE'
require('dotenv').config();
const pool = require('./db/pool');
const { up } = require('./migrations/1757420000000_knowledge_embedding_upgrade');

async function restore() {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await up(client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
restore().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
NODE
```

After the column and index are present, run `node scripts/ingest-knowledge.js`
with the configured embedding credentials to populate the vectors. The ingestion
upserts existing chunks by article slug and chunk index.
