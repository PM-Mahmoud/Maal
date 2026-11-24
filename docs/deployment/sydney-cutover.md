# Maal Sydney cutover runbook

(codex) · operations review draft · HEL-59

The target is DigitalOcean App Platform Sydney. The App Spec region key is
`syd` and the Sydney datacentre is `syd1`. Keep the existing Sydney database.
Mahmoud creates the account, enables billing and makes the DNS change.
[App Platform availability](https://docs.digitalocean.com/products/app-platform/details/availability/)
[App Platform region keys](https://docs.digitalocean.com/products/app-platform/how-to/enable-vpc/)

## Components and configuration

Use the [draft app spec](sydney-app-platform.yaml) to review the web service,
import worker, one pre-deploy migration job and two scheduled jobs. Pin all
components to the approved release commit during cutover. The web build
compiles the React app and route manifest. Allow the platform to supply
`PORT`, aligned with the spec's internal port. The representative radar
and drift schedules require comparison with the active scheduler. App
Platform schedules have a 15-minute minimum. Copy any active backup
verification and backup marker schedules from render.yaml before the old
host is retired, or leave those specific jobs with their current operator
and record that ownership.
[App specification](https://docs.digitalocean.com/products/app-platform/reference/app-spec/)
[Job configuration](https://docs.digitalocean.com/products/app-platform/how-to/manage-jobs/)

| Component | Environment variable names to review |
| --- | --- |
| Web, import worker and pre-deploy migration | `NODE_ENV`, `DATABASE_URL` |
| Web boot, authentication and email | `SESSION_SECRET`, `BASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `FEEDBACK_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Web origin and scheduler | `ORIGIN_SECRET`, `RADAR_CRON_SECRET` |
| Radar and constants jobs | `SCHEDULER_BASE_URL`, `RADAR_CRON_SECRET` |
| Web checkout and outbound webhooks | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `WEBHOOK_SECRET_ENCRYPTION_KEY` |
| Import worker and web data protection | `PROVIDER_TOKEN_ENCRYPTION_KEY`, `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_REGION` |
| Advisor, research and mail or SMS options | `GATEWAY_BASE_URL`, `GATEWAY_API_KEY`, `GATEWAY_MODEL`, `GATEWAY_MODEL_REASONER`, `GATEWAY_MODEL_CHEAP`, `GATEWAY_MODEL_VERIFIER`, `EXA_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| Backup verification and marker, if moved | `BACKUP_RESTORE_DATABASE_URL`, `OPERATIONAL_ALERT_WEBHOOK_URL`, `DATABASE_URL` |

Compare these names against the enabled configuration of each Render
component. Copy the names and values for active direct model, market data,
bank connection and notification providers from the private inventory.
Enter values in the platform's secret UI. Preserve session and token
encryption keys across the move to keep existing sessions and connections
working. Keep job-specific secrets on the components that need them.
Reserve the backup restore database for its disposable restore contract.
See [DEPLOY.md](../../DEPLOY.md).

## Rehearsal

1. Create a Sydney staging app with an isolated test database and sandbox
   integrations. Set `SCHEDULER_BASE_URL` to the staging proxy before enabling test jobs. Keep source auto-deploy disabled for the rehearsal. Check
   the exact revision, both application builds, route manifest, migration
   job logs, health checks, and an import worker processing test data.
2. Capture the existing DNS records, proxy mode, canonical hostname,
   redirects, certificates, managed origin and current scheduler settings in
   the private cutover record. Refresh the www redirect PR #78 when the
   window approaches. Confirm the platform validates the custom domain and
   issues its certificate before customer traffic moves.
3. Rehearse a Cloudflare request header transform rule for the proxied
   hostname. Use **Set** to overwrite `X-Maal-Origin-Secret`. Supply the
   same secret through `ORIGIN_SECRET` to the Sydney web service. Enable
   the app variable only after the transform is ready. Verify direct
   `GET /health` and `HEAD /health` still serve the platform health check,
   that direct application requests are rejected, and that proxied requests
   work. Keep the header value out of request inspection and logs.
4. Point job requests and all external callbacks at the proxied public
   hostname. Jobs send `Authorization: Bearer` using `RADAR_CRON_SECRET`;
   Cloudflare adds the separate origin header. Verify the test radar and
   constants invocations. The drift job proposes changes for review.
5. Rehearse flipping traffic back to the previous origin and restoring the
   old background jobs. Confirm each worker and job has one active owner.

[Custom domains](https://docs.digitalocean.com/products/app-platform/how-to/manage-domains/)
[Cloudflare request header transforms](https://developers.cloudflare.com/rules/transform/request-header-modification/)

## Cutover

1. Agree a quiet window, owners, rollback threshold and support contact.
   Record the approved commit and migration list. Check the existing
   database backup and last successful restore rehearsal.
2. Prepare the approved web build and run the reviewed migration job once
   on the production database. Keep the new import worker and scheduled
   jobs paused while the old host is active. Use backward-compatible
   migrations so the previous version can serve during the transition.
3. Mahmoud switches the canonical proxied hostname to the new origin,
   retaining the existing apex redirect. Check DNS, TLS, `/health`, static
   assets from the new release, sign-in, redirects, previewed critical
   user journeys, and callback routing. Verify the new build identity.
4. Pause the old import worker and radar and drift schedules, wait for
   in-flight work to finish, and enable their Sydney equivalents. Confirm
   one import completes and each new scheduler has a recorded successful
   invocation. Treat the backup jobs separately according to their
   recorded ownership.
5. Record the deployment commit, health, errors, render times, scheduled
   job activity and handover owner in the private operating manual.
   Leave the previous web origin ready during the agreed observation window.

## Rollback

1. Pause the Sydney worker and schedules and finish or safely release
   in-flight jobs. Keep the database and encryption/session keys stable.
2. Mahmoud restores the prior proxied target and canonical redirect setting.
   Confirm that the Cloudflare origin header matches the previous host's
   setting before moving traffic. Verify TLS, the old build identity,
   `/health`, sign-in and callback routing.
3. Resume the old worker and schedules once the Sydney equivalents have
   stopped. Restore their prior cadence and verify one invocation each.
4. Escalate migration or data-integrity problems for a database recovery
   decision. A DNS rollback preserves shared database writes. Reversing a
   migration or restoring a backup needs a separate reviewed recovery plan.
