const pool = require('./pool');

async function enqueueImportRun(userId, {
  provider = 'basiq',
  requestKey,
  maxAttempts = 3,
}) {
  if (!requestKey) throw new Error('Import run requires requestKey');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const runResult = await client.query(
      `INSERT INTO import_runs (user_id, provider, request_key)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id, provider, request_key)
       DO UPDATE SET request_key = EXCLUDED.request_key
       RETURNING *`,
      [userId, provider, requestKey]
    );
    const run = runResult.rows[0];
    if (run.background_job_id) {
      const existingJob = await client.query(
        'SELECT * FROM background_jobs WHERE id = $1',
        [run.background_job_id]
      );
      await client.query('COMMIT');
      return { run, job: existingJob.rows[0] };
    }
    const jobResult = await client.query(
      `INSERT INTO background_jobs
         (user_id, queue, job_type, payload, idempotency_key, max_attempts)
       VALUES ($1, 'imports', 'basiq_import', $2::jsonb, $3, $4)
       RETURNING *`,
      [
        userId,
        JSON.stringify({ import_run_id: run.id, user_id: userId }),
        `import-run:${run.id}`,
        Math.max(1, Number(maxAttempts) || 3),
      ]
    );
    const job = jobResult.rows[0];
    const linked = await client.query(
      `UPDATE import_runs SET background_job_id = $2, updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [run.id, job.id]
    );
    await client.query('COMMIT');
    return { run: linked.rows[0], job };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

class ImportAttemptLostError extends Error {
  constructor() {
    super('Import run is no longer owned by this job attempt');
    this.code = 'JOB_LEASE_LOST';
  }
}

async function withImportFence(runId, userId, attempt, mutation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fence = await client.query(
      `SELECT 1
         FROM import_runs run
         JOIN background_jobs job ON job.id = run.background_job_id
        WHERE run.id = $1 AND run.user_id = $2 AND run.status = 'running'
          AND run.active_attempt_token = $3
          AND job.status = 'running' AND job.locked_by = run.active_worker_id
          AND job.attempts = run.active_job_attempt
          AND job.lease_expires_at > NOW()
        FOR UPDATE OF job`,
      [runId, userId, attempt.token]
    );
    if (!fence.rows[0]) throw new ImportAttemptLostError();
    const result = await mutation();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function startImportRun(runId, userId, attempt) {
  const existing = await pool.query(
    'SELECT * FROM import_runs WHERE id = $1 AND user_id = $2',
    [runId, userId]
  );
  if (!existing.rows[0]) throw new Error('Import run does not exist for this user');
  if (existing.rows[0].status === 'succeeded') return existing.rows[0];
  const { rows } = await pool.query(
    `UPDATE import_runs
        SET status = 'running', attempt_count = attempt_count + 1,
            active_attempt_token = $3, active_worker_id = $5,
            active_job_attempt = $6,
            started_at = COALESCE(started_at, NOW()), completed_at = NULL,
            last_error = NULL, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
        AND status IN ('queued','running','retrying','dead')
        AND background_job_id = $4
        AND EXISTS (
          SELECT 1 FROM background_jobs job
           WHERE job.id = $4 AND job.status = 'running'
             AND job.locked_by = $5 AND job.attempts = $6
             AND job.lease_expires_at > NOW()
        )
      RETURNING *`,
    [runId, userId, attempt.token, attempt.jobId, attempt.workerId, attempt.attempts]
  );
  if (!rows[0]) throw new ImportAttemptLostError();
  return rows[0];
}

async function updateImportProgress(
  runId, userId, attempt, stage, details = {}, checkpoint = {}
) {
  const { rows } = await pool.query(
    `UPDATE import_runs
        SET current_stage = $3,
            progress = progress || jsonb_build_object($3::text, $4::jsonb),
            checkpoints = CASE WHEN $5::jsonb IS NULL THEN checkpoints
              ELSE checkpoints || jsonb_build_object($3::text, $5::jsonb) END,
            updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'running'
        AND active_attempt_token = $6
        AND EXISTS (
          SELECT 1 FROM background_jobs job
           WHERE job.id = background_job_id AND job.status = 'running'
             AND job.locked_by = active_worker_id
             AND job.attempts = active_job_attempt
             AND job.lease_expires_at > NOW()
        )
      RETURNING *`,
    [
      runId, userId, stage, JSON.stringify(details),
      checkpoint === null ? null : JSON.stringify(checkpoint), attempt.token,
    ]
  );
  if (!rows[0]) throw new ImportAttemptLostError();
  return rows[0];
}

async function completeImportRun(runId, userId, attempt, summary) {
  const { rows } = await pool.query(
    `UPDATE import_runs
        SET status = 'succeeded', current_stage = 'complete',
            summary = $4::jsonb, completed_at = NOW(),
            active_attempt_token = NULL, active_worker_id = NULL,
            active_job_attempt = NULL, updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'running'
        AND active_attempt_token = $3
        AND EXISTS (
          SELECT 1 FROM background_jobs job
           WHERE job.id = background_job_id AND job.status = 'running'
             AND job.locked_by = active_worker_id
             AND job.attempts = active_job_attempt
             AND job.lease_expires_at > NOW()
        )
      RETURNING *`,
    [runId, userId, attempt.token, JSON.stringify(summary)]
  );
  if (!rows[0]) throw new ImportAttemptLostError();
  return rows[0];
}

async function failImportRun(runId, userId, attempt, error, willRetry) {
  const { rows } = await pool.query(
    `UPDATE import_runs
        SET status = $5, last_error = $4, active_attempt_token = NULL,
            active_worker_id = NULL, active_job_attempt = NULL,
            updated_at = NOW(),
            completed_at = CASE WHEN $5 = 'dead' THEN NOW() ELSE NULL END
      WHERE id = $1 AND user_id = $2 AND status = 'running'
        AND active_attempt_token = $3
        AND EXISTS (
          SELECT 1 FROM background_jobs job
           WHERE job.id = background_job_id AND job.status = 'running'
             AND job.locked_by = active_worker_id
             AND job.attempts = active_job_attempt
             AND job.lease_expires_at > NOW()
        )
      RETURNING *`,
    [
      runId, userId, attempt.token,
      String(error?.message || error || 'Import failed').slice(0, 2000),
      willRetry ? 'retrying' : 'dead',
    ]
  );
  if (!rows[0]) throw new ImportAttemptLostError();
  return rows[0];
}

async function getImportRunForUser(runId, userId) {
  const { rows } = await pool.query(
    `SELECT run.id, run.provider, run.request_key, run.background_job_id,
            run.status, run.current_stage, run.attempt_count, run.progress,
            run.summary, run.last_error, run.started_at, run.completed_at,
            run.created_at, run.updated_at,
            job.status AS job_status, job.attempts AS job_attempts,
            job.max_attempts AS job_max_attempts, job.run_at AS next_retry_at
       FROM import_runs run
       LEFT JOIN background_jobs job ON job.id = run.background_job_id
      WHERE run.id = $1 AND run.user_id = $2`,
    [runId, userId]
  );
  return rows[0] || null;
}

module.exports = {
  ImportAttemptLostError,
  withImportFence,
  enqueueImportRun,
  startImportRun,
  updateImportProgress,
  completeImportRun,
  failImportRun,
  getImportRunForUser,
};
