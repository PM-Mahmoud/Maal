const pool = require('./pool');

class JobLeaseLostError extends Error {
  constructor() {
    super('Background job lease is no longer owned by this worker');
    this.code = 'JOB_LEASE_LOST';
  }
}

async function enqueueJob({
  userId = null,
  queue = 'default',
  jobType,
  payload = {},
  idempotencyKey = null,
  priority = 0,
  maxAttempts = 3,
  runAt = null,
}) {
  if (!jobType) throw new Error('Background job requires jobType');
  const params = [
    userId, queue, jobType, JSON.stringify(payload), idempotencyKey,
    Number(priority) || 0, Math.max(1, Number(maxAttempts) || 3), runAt,
  ];
  const { rows } = await pool.query(
    `WITH inserted AS (
       INSERT INTO background_jobs
         (user_id, queue, job_type, payload, idempotency_key, priority, max_attempts, run_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,COALESCE($8::timestamptz, NOW()))
       ON CONFLICT DO NOTHING
       RETURNING *
     )
     SELECT * FROM inserted
     UNION ALL
     SELECT * FROM background_jobs
      WHERE queue = $2 AND job_type = $3 AND idempotency_key = $5
        AND user_id IS NOT DISTINCT FROM $1
        AND NOT EXISTS (SELECT 1 FROM inserted)
     LIMIT 1`,
    params
  );
  if (rows[0]) return rows[0];
  // A concurrent INSERT can win the unique-key race but remain invisible to
  // the CTE statement snapshot. A fresh statement sees the committed winner.
  if (idempotencyKey) {
    const existing = await pool.query(
      `SELECT * FROM background_jobs
        WHERE queue = $1 AND job_type = $2 AND idempotency_key = $3
          AND user_id IS NOT DISTINCT FROM $4`,
      [queue, jobType, idempotencyKey, userId]
    );
    if (existing.rows[0]) return existing.rows[0];
  }
  throw new Error('Could not enqueue background job');
}

async function claimNextJob({ workerId, queues = ['default'], leaseSeconds = 60 }) {
  if (!workerId) throw new Error('claimNextJob requires workerId');
  const safeQueues = [...new Set(queues)].filter(Boolean);
  if (!safeQueues.length) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE background_jobs
          SET status = 'dead',
              last_error = COALESCE(last_error, 'Worker lease expired after final attempt'),
              locked_by = NULL, locked_at = NULL, lease_expires_at = NULL,
              completed_at = NOW(), updated_at = NOW()
        WHERE status = 'running' AND lease_expires_at <= NOW()
          AND attempts >= max_attempts`
    );
    const { rows } = await client.query(
      `WITH candidate AS (
         SELECT id FROM background_jobs
          WHERE queue = ANY($1::text[])
            AND attempts < max_attempts
            AND (
              (status = 'queued' AND run_at <= NOW())
              OR (status = 'running' AND lease_expires_at <= NOW())
            )
          ORDER BY priority DESC, run_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
       )
       UPDATE background_jobs job
          SET status = 'running', attempts = attempts + 1,
              locked_by = $2, locked_at = NOW(),
              lease_expires_at = NOW() + ($3::int * INTERVAL '1 second'),
              updated_at = NOW()
         FROM candidate
        WHERE job.id = candidate.id
       RETURNING job.*`,
      [safeQueues, workerId, Math.max(5, Number(leaseSeconds) || 60)]
    );
    await client.query('COMMIT');
    return rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function heartbeatJob(jobId, workerId, leaseSeconds = 60) {
  const result = await pool.query(
    `UPDATE background_jobs
        SET lease_expires_at = NOW() + ($3::int * INTERVAL '1 second'),
            updated_at = NOW()
      WHERE id = $1 AND status = 'running' AND locked_by = $2
        AND lease_expires_at > NOW()`,
    [jobId, workerId, Math.max(5, Number(leaseSeconds) || 60)]
  );
  if (result.rowCount !== 1) throw new JobLeaseLostError();
  return true;
}

async function completeJob(jobId, workerId, result = null) {
  const completed = await pool.query(
    `UPDATE background_jobs
        SET status = 'succeeded', result = $3::jsonb, completed_at = NOW(),
            locked_by = NULL, locked_at = NULL, lease_expires_at = NULL,
            updated_at = NOW()
      WHERE id = $1 AND status = 'running' AND locked_by = $2
        AND lease_expires_at > NOW()
      RETURNING *`,
    [jobId, workerId, JSON.stringify(result)]
  );
  if (completed.rowCount !== 1) throw new JobLeaseLostError();
  return completed.rows[0];
}

async function failJob(jobId, workerId, error) {
  const failed = await pool.query(
    `UPDATE background_jobs
        SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'queued' END,
            run_at = CASE WHEN attempts >= max_attempts THEN run_at
              ELSE NOW() + (LEAST(3600, 30 * power(2, GREATEST(attempts - 1, 0))) * INTERVAL '1 second')
            END,
            last_error = $3,
            completed_at = CASE WHEN attempts >= max_attempts THEN NOW() ELSE NULL END,
            locked_by = NULL, locked_at = NULL, lease_expires_at = NULL,
            updated_at = NOW()
      WHERE id = $1 AND status = 'running' AND locked_by = $2
        AND lease_expires_at > NOW()
      RETURNING *`,
    [jobId, workerId, String(error?.message || error || 'Background job failed').slice(0, 2000)]
  );
  if (failed.rowCount !== 1) throw new JobLeaseLostError();
  return failed.rows[0];
}

async function listJobsForUser(userId, limit = 50) {
  const { rows } = await pool.query(
    `SELECT id, queue, job_type, status, attempts, max_attempts, run_at,
            last_error, result, completed_at, created_at, updated_at
       FROM background_jobs
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [userId, Math.min(Math.max(Number(limit) || 50, 1), 200)]
  );
  return rows;
}

module.exports = {
  JobLeaseLostError,
  enqueueJob,
  claimNextJob,
  heartbeatJob,
  completeJob,
  failJob,
  listJobsForUser,
};
