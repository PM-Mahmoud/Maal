const { pool } = require('./auth');
const { payloadHash } = require('../lib/data-quality');

async function appendRawRecord(userId, {
  source, entityType, sourceRecordId, payload, observedAt,
}) {
  const hash = payloadHash(payload);
  const result = await pool.query(
    `INSERT INTO raw_financial_records
       (user_id, source, entity_type, source_record_id, payload, payload_hash, observed_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, COALESCE($7::timestamptz, NOW()))
     ON CONFLICT (user_id, source, entity_type, source_record_id, payload_hash)
     DO NOTHING
     RETURNING id`,
    [userId, source, entityType, String(sourceRecordId), JSON.stringify(payload), hash, observedAt || null]
  );
  if (result.rowCount === 1) return { id: result.rows[0].id, hash, inserted: true };

  const existing = await pool.query(
    `SELECT id FROM raw_financial_records
      WHERE user_id = $1 AND source = $2 AND entity_type = $3
        AND source_record_id = $4 AND payload_hash = $5`,
    [userId, source, entityType, String(sourceRecordId), hash]
  );
  return { id: existing.rows[0].id, hash, inserted: false };
}

async function recordCalculation(userId, {
  type, version, effectiveAt, inputs, assumptions = {}, result, sourceRecordIds = [],
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO calculation_audits
         (user_id, calculation_type, calculation_version, effective_at,
          inputs, assumptions, result)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
       RETURNING id`,
      [
        userId, type, version, effectiveAt,
        JSON.stringify(inputs), JSON.stringify(assumptions), JSON.stringify(result),
      ]
    );
    const calculationId = inserted.rows[0].id;
    const uniqueSourceIds = [...new Set(sourceRecordIds.map(String))];
    if (uniqueSourceIds.length) {
      const linked = await client.query(
        `INSERT INTO calculation_audit_sources
           (calculation_audit_id, raw_record_id, user_id)
         SELECT $1, raw.id, $2
           FROM raw_financial_records raw
          WHERE raw.user_id = $2 AND raw.id = ANY($3::bigint[])`,
        [calculationId, userId, uniqueSourceIds]
      );
      if (linked.rowCount !== uniqueSourceIds.length) {
        throw new Error('Calculation sources must all exist and belong to the user');
      }
    }
    await client.query('COMMIT');
    return calculationId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function countsFor(findings) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const item of findings) {
    if (Object.prototype.hasOwnProperty.call(counts, item.severity)) counts[item.severity]++;
  }
  return counts;
}

function statusForCounts(counts) {
  if (counts.error > 0) return 'critical';
  if (counts.warning > 0) return 'attention';
  return 'healthy';
}

async function syncFindings(userId, findings, evaluatedCheckCodes, options = {}) {
  const checkCodes = [...new Set(evaluatedCheckCodes || findings.map((item) => item.check_code))];
  if (!checkCodes.length) throw new Error('syncFindings requires the evaluated check codes');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of findings) {
      await client.query(
        `INSERT INTO data_quality_findings
           (user_id, check_code, entity_type, entity_key, severity, summary, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (user_id, check_code, entity_type, entity_key)
         DO UPDATE SET severity = EXCLUDED.severity, summary = EXCLUDED.summary,
           details = EXCLUDED.details,
           status = CASE
             WHEN data_quality_findings.status = 'ignored' THEN 'ignored'
             ELSE 'open'
           END,
           last_seen_at = NOW(),
           resolved_at = CASE
             WHEN data_quality_findings.status = 'ignored'
               THEN data_quality_findings.resolved_at
             ELSE NULL
           END`,
        [
          userId, item.check_code, item.entity_type, item.entity_key || '',
          item.severity, item.summary, JSON.stringify(item.details || {}),
        ]
      );
    }

    const currentCodes = findings.map((item) => item.check_code);
    const currentTypes = findings.map((item) => item.entity_type);
    const currentKeys = findings.map((item) => item.entity_key || '');
    await client.query(
      `UPDATE data_quality_findings existing
          SET status = 'resolved', resolved_at = NOW()
        WHERE existing.user_id = $1
          AND existing.status = 'open'
          AND existing.check_code = ANY($2::text[])
          AND NOT EXISTS (
            SELECT 1
              FROM unnest($3::text[], $4::text[], $5::text[])
                   AS current(check_code, entity_type, entity_key)
             WHERE current.check_code = existing.check_code
               AND current.entity_type = existing.entity_type
               AND current.entity_key = existing.entity_key
          )`,
      [userId, checkCodes, currentCodes, currentTypes, currentKeys]
    );
    // Derive the run status from active persisted findings, not merely detected
    // findings. This keeps a deliberately ignored issue from producing a
    // "critical" health result with an empty active-findings list.
    const activeResult = await client.query(
      `SELECT severity, COUNT(*)::int AS count
         FROM data_quality_findings
        WHERE user_id = $1 AND status = 'open'
        GROUP BY severity`,
      [userId]
    );
    const counts = { error: 0, warning: 0, info: 0 };
    for (const row of activeResult.rows) {
      if (Object.prototype.hasOwnProperty.call(counts, row.severity)) {
        counts[row.severity] = Number(row.count) || 0;
      }
    }
    const coverage = options.coverage || {};
    const isComplete = Object.values(coverage).every((value) => value === 'complete');
    const status = isComplete ? statusForCounts(counts) : 'incomplete';
    await client.query(
      `INSERT INTO data_quality_runs
         (user_id, trigger, status, error_count, warning_count, info_count, coverage, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        userId, options.trigger || 'manual', status,
        counts.error, counts.warning, counts.info,
        JSON.stringify(coverage), options.message || null,
      ]
    );
    await client.query('COMMIT');
    return { findings: findings.length, counts, status };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getDataHealth(userId) {
  const [runResult, findingResult] = await Promise.all([
    pool.query(
      `SELECT status, error_count, warning_count, info_count, trigger,
              coverage, message, checked_at
         FROM data_quality_runs
        WHERE user_id = $1
        ORDER BY checked_at DESC, id DESC
        LIMIT 1`,
      [userId]
    ),
    pool.query(
      `SELECT id, check_code, entity_type, entity_key, severity, status,
              summary, details, first_seen_at, last_seen_at
         FROM data_quality_findings
        WHERE user_id = $1 AND status = 'open'
        ORDER BY
          CASE severity WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
          last_seen_at DESC`,
      [userId]
    ),
  ]);
  const run = runResult.rows[0] || null;
  return {
    status: run?.status || 'not_checked',
    counts: run ? {
      error: Number(run.error_count) || 0,
      warning: Number(run.warning_count) || 0,
      info: Number(run.info_count) || 0,
    } : { error: 0, warning: 0, info: 0 },
    trigger: run?.trigger || null,
    coverage: run?.coverage || {},
    message: run?.message || null,
    checked_at: run?.checked_at || null,
    findings: findingResult.rows,
  };
}

async function recordDataQualityFailure(userId, { trigger = 'unknown', message, coverage = {} } = {}) {
  await pool.query(
    `INSERT INTO data_quality_runs
       (user_id, trigger, status, coverage, message)
     VALUES ($1, $2, 'failed', $3::jsonb, $4)`,
    [userId, trigger, JSON.stringify(coverage), String(message || 'Quality check failed').slice(0, 500)]
  );
}

module.exports = {
  appendRawRecord, recordCalculation, syncFindings, getDataHealth, recordDataQualityFailure,
  countsFor, statusForCounts,
};
