// services/digest.js — daily portfolio-summary digest sweep (PR 10).
//
// Iterates users who opted in (notification_prefs.daily_digest = true), builds
// each one's digest model from their real data, and emails it via Resend. Hit by
// an external scheduler once a day (GET /internal/digest/run, cron-secret gated).
// Best-effort per user — one failure never aborts the sweep.

const { usersWithDigestOptIn } = require('../db/users');
const { getProfileByUserId } = require('../db/profiles');
const assetsDb = require('../db/assets');
const { computeMaalScore } = require('../lib/maal-score');
const { snapshotValuesFromProfile, getSnapshots } = require('../db/snapshots');
const { buildDigestModel } = require('../lib/digest');
const { sendPortfolioDigest } = require('./email');

let _running = false;

async function runDailyDigest() {
  if (_running) return { sent: 0, skipped: true };
  _running = true;
  try {
    const users = await usersWithDigestOptIn();
    let sent = 0;
    let failed = 0;
    for (const u of users) {
      try {
        const rawProfile = (await getProfileByUserId(u.id)) || {};
        const assetSummary = await assetsDb.getAssetSummary(u.id);
        const profile = assetsDb.mergeAssetSummaryIntoProfile(rawProfile, assetSummary);
        const snap = snapshotValuesFromProfile(profile);
        const maal = computeMaalScore(profile);
        const snapshots = await getSnapshots(u.id, 30).catch(() => []);
        const model = buildDigestModel({ snap, maal, snapshots, profile });
        await sendPortfolioDigest(u, model);
        sent++;
      } catch (e) {
        failed++;
        console.error(`[digest] failed for user ${u.id}:`, e.message);
      }
    }
    return { candidates: users.length, sent, failed };
  } finally {
    _running = false;
  }
}

module.exports = { runDailyDigest };
