const pool = require('./pool');

async function upsertHealth(userId, provider, patch) {
  const { rows } = await pool.query(
    `INSERT INTO provider_connection_health
       (user_id, provider, status, provider_status, consent_expires_at,
        last_checked_at, last_success_at, last_failure_at,
        consecutive_failures, last_error, details)
     VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8,$9,$10::jsonb)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       status = EXCLUDED.status,
       provider_status = COALESCE(EXCLUDED.provider_status, provider_connection_health.provider_status),
       consent_expires_at = CASE WHEN $11 THEN EXCLUDED.consent_expires_at
         ELSE COALESCE(EXCLUDED.consent_expires_at, provider_connection_health.consent_expires_at) END,
       last_checked_at = NOW(),
       last_success_at = COALESCE(EXCLUDED.last_success_at, provider_connection_health.last_success_at),
       last_failure_at = COALESCE(EXCLUDED.last_failure_at, provider_connection_health.last_failure_at),
       consecutive_failures = EXCLUDED.consecutive_failures,
       last_error = EXCLUDED.last_error,
       details = provider_connection_health.details || EXCLUDED.details,
       updated_at = NOW()
     RETURNING *`,
    [
      userId, provider, patch.status, patch.providerStatus || null,
      patch.consentExpiresAt || null, patch.successAt || null, patch.failureAt || null,
      patch.consecutiveFailures || 0, patch.lastError || null,
      JSON.stringify(patch.details || {}),
      patch.replaceConsent === true,
    ]
  );
  return rows[0];
}

async function getHealth(userId, provider = 'basiq') {
  const { rows } = await pool.query(
    `SELECT provider, status, provider_status, consent_expires_at,
            last_checked_at, last_success_at, last_failure_at,
            consecutive_failures, last_error, details, updated_at
       FROM provider_connection_health
      WHERE user_id = $1 AND provider = $2`,
    [userId, provider]
  );
  return rows[0] || null;
}

async function listLinkedBasiqUserIds() {
  const { rows } = await pool.query(
    `SELECT id FROM users
      WHERE basiq_user_id IS NOT NULL AND basiq_user_id <> ''`
  );
  return rows.map((row) => row.id);
}

async function scheduleBasiqHealthCheck(userId, runAt, excludeJobId = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT pg_advisory_xact_lock(
         hashtextextended('basiq-health:' || $1::text, 0)
       )`,
      [userId]
    );
    const existing = await client.query(
      `SELECT * FROM background_jobs
        WHERE user_id = $1 AND queue = 'monitoring'
          AND job_type = 'basiq_connection_health'
          AND status IN ('queued','running')
          AND ($2::bigint IS NULL OR id <> $2)
        ORDER BY run_at ASC LIMIT 1`,
      [userId, excludeJobId]
    );
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return existing.rows[0];
    }
    const inserted = await client.query(
      `INSERT INTO background_jobs
         (user_id, queue, job_type, payload, max_attempts, run_at)
       VALUES ($1::bigint, 'monitoring', 'basiq_connection_health',
               jsonb_build_object('user_id', $1::bigint), 3, $2::timestamptz)
       RETURNING *`,
      [userId, runAt]
    );
    await client.query('COMMIT');
    return inserted.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  upsertHealth, getHealth, listLinkedBasiqUserIds, scheduleBasiqHealthCheck,
};
