const os = require('os');
const jobs = require('../db/background-jobs');
const { createBackgroundWorker } = require('../services/background-worker');
const { basiqImportHandler } = require('../services/basiq-import-job');
const {
  basiqConnectionHealthJob,
  seedConnectionHealthJobs,
} = require('../services/connection-health');

const worker = createBackgroundWorker({
  jobs,
  workerId: process.env.WORKER_ID || `${os.hostname()}:${process.pid}`,
  queues: ['imports', 'monitoring'],
  leaseSeconds: Number(process.env.WORKER_LEASE_SECONDS) || 60,
  handlers: {
    basiq_import: basiqImportHandler,
    basiq_connection_health: basiqConnectionHealthJob,
  },
});

let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

async function run() {
  await seedConnectionHealthJobs();
  while (!stopping) {
    const result = await worker.runOnce();
    if (result.status === 'idle') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

run().then(() => process.exit(0)).catch((error) => {
  console.error('Background worker stopped:', error);
  process.exit(1);
});
