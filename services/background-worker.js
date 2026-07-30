function createBackgroundWorker({
  jobs,
  handlers,
  workerId,
  queues = ['default'],
  leaseSeconds = 60,
  heartbeatIntervalMs = Math.max(1000, Math.floor((leaseSeconds * 1000) / 3)),
}) {
  if (!workerId) throw new Error('Background worker requires a stable workerId');

  async function runOnce() {
    const job = await jobs.claimNextJob({ workerId, queues, leaseSeconds });
    if (!job) return { status: 'idle' };

    const handler = handlers[job.job_type];
    const controller = new AbortController();
    let heartbeatInFlight = null;
    let leaseError = null;
    const renewLease = async () => {
      if (heartbeatInFlight) return heartbeatInFlight;
      heartbeatInFlight = Promise.resolve(
        jobs.heartbeatJob(job.id, workerId, leaseSeconds)
      ).catch((error) => {
        leaseError = error;
        controller.abort(error);
      }).finally(() => {
        heartbeatInFlight = null;
      });
      return heartbeatInFlight;
    };
    const heartbeatTimer = setInterval(renewLease, heartbeatIntervalMs);
    heartbeatTimer.unref?.();
    try {
      if (!handler) throw new Error(`No handler registered for job type: ${job.job_type}`);
      const result = await handler(job, {
        heartbeat: renewLease,
        signal: controller.signal,
      });
      clearInterval(heartbeatTimer);
      if (heartbeatInFlight) await heartbeatInFlight;
      if (leaseError) {
        return { status: 'lease_lost', jobId: job.id, error: leaseError.message };
      }
      try {
        await jobs.completeJob(job.id, workerId, result === undefined ? null : result);
      } catch (error) {
        if (error.code === 'JOB_LEASE_LOST') {
          return { status: 'lease_lost', jobId: job.id, error: error.message };
        }
        throw error;
      }
      return { status: 'succeeded', jobId: job.id, result: result === undefined ? null : result };
    } catch (error) {
      clearInterval(heartbeatTimer);
      if (heartbeatInFlight) await heartbeatInFlight;
      if (leaseError) {
        return { status: 'lease_lost', jobId: job.id, error: leaseError.message };
      }
      if (error.code === 'JOB_LEASE_LOST') {
        return { status: 'lease_lost', jobId: job.id, error: error.message };
      }
      let failed;
      try {
        failed = await jobs.failJob(job.id, workerId, error);
      } catch (failureError) {
        if (failureError.code === 'JOB_LEASE_LOST') {
          return { status: 'lease_lost', jobId: job.id, error: failureError.message };
        }
        throw failureError;
      }
      return {
        status: failed.status,
        jobId: job.id,
        error: error.message,
      };
    }
  }

  return { runOnce };
}

module.exports = { createBackgroundWorker };
