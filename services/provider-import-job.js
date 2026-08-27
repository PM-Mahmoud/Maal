'use strict';

const importRuns = require('../db/import-runs');
const health = require('../db/connection-health');
const providerConnections = require('../db/provider-connections');

function createProviderImportHandler({ provider, sync, imports = importRuns, healthStore = health, eventStore = providerConnections }) {
  if (!provider) throw new Error('Provider import handler requires provider id');
  return async function providerImportHandler(job, context = {}) {
    const runId = job.payload.import_run_id;
    const userId = job.payload.user_id;
    const attempt = { token: `${job.id}:${job.attempts}:${job.locked_by}`, jobId: job.id, workerId: job.locked_by, attempts: job.attempts };
    const run = await imports.startImportRun(runId, userId, attempt);
    if (run.status === 'succeeded') return { import_run_id: runId, ...(run.summary || {}) };
    try {
      const summary = await sync(userId, {
        signal: context.signal,
        withFence: async (mutation) => {
          await context.heartbeat?.();
          return imports.withImportFence(runId, userId, attempt, mutation);
        },
        onProgress: async (stage, details, checkpoint = {}) => {
          await context.heartbeat?.();
          return imports.updateImportProgress(runId, userId, attempt, stage, details, checkpoint);
        },
      });
      await imports.completeImportRun(runId, userId, attempt, summary);
      await healthStore.upsertHealth(userId, provider, {
        status: 'healthy', successAt: new Date(), consecutiveFailures: 0, lastError: null,
        details: { last_import_run_id: runId },
      });
      await eventStore.recordEvent?.(userId, provider, 'sync_succeeded', { importRunId: runId, details: summary });
      return { import_run_id: runId, ...summary };
    } catch (error) {
      const willRetry = Number(job.attempts) < Number(job.max_attempts);
      await imports.failImportRun(runId, userId, attempt, error, willRetry);
      const current = await healthStore.getHealth(userId, provider);
      await healthStore.upsertHealth(userId, provider, {
        status: /reauthor|revoked|401/i.test(`${error.status || ''} ${error.message}`) ? 'reauthorization_required' : 'degraded',
        failureAt: new Date(), consecutiveFailures: Number(current?.consecutive_failures || 0) + 1,
        lastError: String(error.message || error).slice(0, 1000), details: { last_import_run_id: runId },
      });
      await eventStore.recordEvent?.(userId, provider, 'sync_failed', { importRunId: runId, details: { error: String(error.message || error).slice(0, 500) } });
      throw error;
    }
  };
}

module.exports = { createProviderImportHandler };
