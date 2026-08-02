const {
  runBackupVerification,
  runOperationalSweep,
} = require('../services/operational-resilience');

(async () => {
  const result = await runBackupVerification();
  await runOperationalSweep();
  if (result.status !== 'succeeded') process.exitCode = 1;
})().catch(async (error) => {
  console.error('Backup restore verification failed:', error.message);
  try {
    await runOperationalSweep();
  } catch (sweepError) {
    console.error('Operational sweep failed:', sweepError.message);
  }
  process.exitCode = 1;
});
