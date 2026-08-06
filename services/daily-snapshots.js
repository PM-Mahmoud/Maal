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
  const value = (key) => {
    const raw = profile?.[key];
    if (raw === null || raw === undefined || raw === '') return 0;
    const number = Number(raw);
    if (!Number.isFinite(number)) throw new Error(`Invalid financial value: ${key}`);
    return Math.round(number * 100) / 100;
  };
  const superBalance = value('super_balance');
  const investBalance = value('investment_portfolio');
  const propertyValue = value('property_value');
  const cashBalance = value('cash_savings');
  const debtsTotal = value('hecs_balance') + value('total_debt');
  const assetsTotal = superBalance + investBalance + propertyValue + cashBalance;
  return {
    netWorth: Math.round((assetsTotal - debtsTotal) * 100) / 100,
    assetsTotal: Math.round(assetsTotal * 100) / 100,
    superBalance, investBalance, debtsTotal: Math.round(debtsTotal * 100) / 100, cashBalance,
  };
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

const database = {
  async loadSnapshotProfile(userId) {
    const profile = (await profiles.getProfileByUserId(userId)) || {};
    return assets.mergeAssetSummaryIntoProfile(profile, await assets.getAssetSummary(userId));
  },
  recordSnapshot: snapshots.recordSnapshot,
};

module.exports = {
  snapshotDate, validatedSnapshotValues, createDailySnapshotService,
  createDailySnapshot: createDailySnapshotService(database),
};
