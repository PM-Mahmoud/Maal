const profiles = require('../db/profiles');
const assets = require('../db/assets');
const snapshots = require('../db/snapshots');

function snapshotDate(now = new Date(), timeZone = 'Australia/Perth') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function validatedSnapshotValues(profile) {
  return snapshots.snapshotValuesFromProfile(profile, { strict: true });
}

function createDailySnapshotService(database) {
  return async function createDailySnapshot(userId, options = {}) {
    const profile = await database.loadSnapshotProfile(userId);
    const values = validatedSnapshotValues(profile);
    return database.recordSnapshot(
      userId, snapshotDate(options.now, options.timeZone), values
    );
  };
}

function createDailySnapshotSweep(database, createSnapshot) {
  return async function captureDailySnapshots() {
    const userIds = await database.listSnapshotUserIds();
    const result = { captured: 0, failed: 0 };
    for (const userId of userIds) {
      try { await createSnapshot(userId); result.captured++; }
      catch (error) { result.failed++; console.error(`[snapshots] user ${userId}:`, error.message); }
    }
    return result;
  };
}

const database = {
  async loadSnapshotProfile(userId) {
    const profile = (await profiles.getProfileByUserId(userId)) || {};
    return assets.mergeAssetSummaryIntoProfile(profile, await assets.getAssetSummary(userId));
  },
  recordSnapshot: snapshots.recordSnapshot,
  listSnapshotUserIds: snapshots.listSnapshotUserIds,
};

const createDailySnapshot = createDailySnapshotService(database);

module.exports = {
  snapshotDate, validatedSnapshotValues, createDailySnapshotService, createDailySnapshotSweep,
  createDailySnapshot,
  captureDailySnapshots: createDailySnapshotSweep(database, createDailySnapshot),
};
