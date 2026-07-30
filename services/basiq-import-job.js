const importsDb = require('../db/import-runs');
const { syncBasiqData } = require('./basiq-sync');
const connectionHealth = require('./connection-health');

function createBasiqImportHandler({ imports, sync, health = null }) {
  return async function handleBasiqImport(job, context) {
    const runId = job.payload.import_run_id;
    const userId = job.payload.user_id;
    const attempt = {
      token: `${job.id}:${job.attempts}:${job.locked_by}`,
      jobId: job.id,
      attempts: job.attempts,
      workerId: job.locked_by,
    };
    const run = await imports.startImportRun(runId, userId, attempt);
    if (run.status === 'succeeded') {
      return { import_run_id: runId, ...(run.summary || {}) };
    }
    try {
      const assertOwnership = async () => {
        if (context.signal?.aborted) throw context.signal.reason;
        await context.heartbeat();
        if (context.signal?.aborted) throw context.signal.reason;
      };
      const summary = await sync(userId, {
        checkpoints: run.checkpoints || {},
        signal: context.signal,
        assertOwnership,
        withFence: async (mutation) => {
          await assertOwnership();
          return imports.withImportFence(runId, userId, attempt, mutation);
        },
        onProgress: async (stage, details, checkpoint = details) => {
          await assertOwnership();
          await imports.updateImportProgress(
            runId, userId, attempt, stage, details, checkpoint
          );
        },
      });
      await imports.completeImportRun(runId, userId, attempt, summary);
      try {
        await health?.checkBasiqConnection(userId);
        await health?.scheduleNextCheck(userId);
      } catch (healthError) {
        console.error('Could not record Basiq connection success:', healthError.message);
      }
      return { import_run_id: runId, ...summary };
    } catch (error) {
      if (context.signal?.aborted || error.code === 'JOB_LEASE_LOST') throw error;
      if (health?.shouldRecordProviderFailure(error)) {
        try {
          await health.recordImportFailure(userId, error);
        } catch (healthError) {
          console.error('Could not record Basiq connection failure:', healthError.message);
        }
      }
      await imports.failImportRun(
        runId, userId, attempt, error, job.attempts < job.max_attempts
      );
      throw error;
    }
  };
}

module.exports = {
  createBasiqImportHandler,
  basiqImportHandler: createBasiqImportHandler({
    imports: importsDb,
    sync: syncBasiqData,
    health: connectionHealth,
  }),
};
