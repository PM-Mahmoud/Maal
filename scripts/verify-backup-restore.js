const { safeError } = require('../lib/safe-log');
const {
  runBackupVerification,
  runOperationalSweep,
} = require('../services/operational-resilience');

(async () => {
  const result = await runBackupVerification();
  await runOperationalSweep();
  if (result.status !== 'succeeded') process.exitCode = 1;
})().catch(async (error) => {
  console.error('Backup restore verification failed:', safeError(error));
  try {
    await runOperationalSweep();
  } catch (sweepError) {
    console.error('Operational sweep failed:', safeError(sweepError));
  }
  process.exitCode = 1;
});
