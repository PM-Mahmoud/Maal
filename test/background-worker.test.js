const assert = require('assert');
const { createBackgroundWorker } = require('../services/background-worker');

(async () => {
  const events = [];
  const jobs = {
    claimNextJob: async (options) => ({
      id: 11,
      job_type: 'example',
      payload: { value: 4 },
      attempts: 1,
      max_attempts: 3,
      ...options,
    }),
    heartbeatJob: async (id, workerId) => events.push(['heartbeat', id, workerId]),
    completeJob: async (id, workerId, result) => events.push(['complete', id, workerId, result]),
    failJob: async (id, workerId, error) => events.push(['fail', id, workerId, error.message]),
  };
  const worker = createBackgroundWorker({
    jobs,
    workerId: 'worker-a',
    queues: ['financial'],
    handlers: {
      example: async (job, context) => {
        assert.deepStrictEqual(job.payload, { value: 4 });
        await context.heartbeat();
        return { doubled: 8 };
      },
    },
  });
  assert.deepStrictEqual(await worker.runOnce(), {
    status: 'succeeded',
    jobId: 11,
    result: { doubled: 8 },
  });
  assert.deepStrictEqual(events, [
    ['heartbeat', 11, 'worker-a'],
    ['complete', 11, 'worker-a', { doubled: 8 }],
  ]);

  const failedEvents = [];
  const failingWorker = createBackgroundWorker({
    jobs: {
      claimNextJob: async () => ({
        id: 12, job_type: 'broken', payload: {}, attempts: 1, max_attempts: 2,
      }),
      failJob: async (id, workerId, error) => {
        failedEvents.push([id, workerId, error.message]);
        return { status: 'queued' };
      },
    },
    workerId: 'worker-b',
    handlers: { broken: async () => { throw new Error('temporary failure'); } },
  });
  assert.deepStrictEqual(await failingWorker.runOnce(), {
    status: 'queued',
    jobId: 12,
    error: 'temporary failure',
  });
  assert.deepStrictEqual(failedEvents, [[12, 'worker-b', 'temporary failure']]);

  const unknownWorker = createBackgroundWorker({
    jobs: {
      claimNextJob: async () => ({
        id: 13, job_type: 'unknown', payload: {}, attempts: 1, max_attempts: 1,
      }),
      failJob: async (_id, _workerId, error) => ({ status: error.message.includes('No handler') ? 'dead' : 'failed' }),
    },
    workerId: 'worker-c',
    handlers: {},
  });
  assert.equal((await unknownWorker.runOnce()).status, 'dead');

  const idleWorker = createBackgroundWorker({
    jobs: { claimNextJob: async () => null },
    workerId: 'worker-d',
    handlers: {},
  });
  assert.deepStrictEqual(await idleWorker.runOnce(), { status: 'idle' });

  let active = false;
  let leaseUntil = 0;
  let automaticHeartbeats = 0;
  const leasingJobs = {
    claimNextJob: async ({ workerId }) => {
      if (active && Date.now() < leaseUntil) return null;
      active = true;
      leaseUntil = Date.now() + 15;
      return {
        id: 14, job_type: 'slow', payload: {}, attempts: 1, max_attempts: 3,
        locked_by: workerId,
      };
    },
    heartbeatJob: async () => {
      automaticHeartbeats++;
      leaseUntil = Date.now() + 15;
    },
    completeJob: async () => { active = false; },
    failJob: async () => ({ status: 'queued' }),
  };
  const slowWorker = createBackgroundWorker({
    jobs: leasingJobs,
    workerId: 'worker-slow',
    leaseSeconds: 1,
    heartbeatIntervalMs: 5,
    handlers: {
      slow: async () => new Promise((resolve) => setTimeout(() => resolve('done'), 40)),
    },
  });
  const slowRun = slowWorker.runOnce();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(
    await leasingJobs.claimNextJob({ workerId: 'worker-second' }),
    null,
    'automatic heartbeats must prevent a second worker reclaiming an active job'
  );
  assert.equal((await slowRun).status, 'succeeded');
  assert(automaticHeartbeats >= 2);

  const leaseLost = () => Object.assign(new Error('lease expired'), {
    code: 'JOB_LEASE_LOST',
  });
  const completionLeaseLoss = createBackgroundWorker({
    jobs: {
      claimNextJob: async () => ({ id: 15, job_type: 'finish', payload: {} }),
      heartbeatJob: async () => true,
      completeJob: async () => { throw leaseLost(); },
      failJob: async () => { throw new Error('must not attempt stale failure'); },
    },
    workerId: 'worker-finish-race',
    handlers: { finish: async () => 'done' },
  });
  assert.equal((await completionLeaseLoss.runOnce()).status, 'lease_lost');

  const failureLeaseLoss = createBackgroundWorker({
    jobs: {
      claimNextJob: async () => ({ id: 16, job_type: 'fail', payload: {} }),
      heartbeatJob: async () => true,
      failJob: async () => { throw leaseLost(); },
    },
    workerId: 'worker-failure-race',
    handlers: { fail: async () => { throw new Error('handler failed after expiry'); } },
  });
  assert.equal((await failureLeaseLoss.runOnce()).status, 'lease_lost');

  console.log('✓ background worker contract handles success, heartbeat, retry, dead, and idle states');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
