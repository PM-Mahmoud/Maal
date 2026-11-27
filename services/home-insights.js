'use strict';

const profiles = require('../db/profiles');
const assets = require('../db/assets');
const transactions = require('../db/transactions');
const { buildHomeInsights } = require('../lib/home-insights');
const { safeError } = require('../lib/safe-log');

async function homeInsightsHandler(req, res) {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const [profile, cashAccounts, incomes, effective] = await Promise.all([
      profiles.getProfileByUserId(userId),
      assets.listCashAccounts(userId),
      assets.listIncomes(userId),
      transactions.getCashFlowTransactions(userId),
    ]);
    // A confirmed zero-balance account still supports a zero-month estimate.
    const hasCash = cashAccounts.some((account) => account.include_in_net_worth !== false)
      || Number(profile?.cash_savings) > 0;
    const totals = assets.summarizeAssets({ cashAccounts, incomes });
    const effectiveProfile = assets.mergeAssetSummaryIntoProfile(profile, totals);
    return res.json(buildHomeInsights({ profile: effectiveProfile, hasCash, transactions: effective }));
  } catch (error) {
    console.error('/api/v1/home-insights error:', safeError(error));
    return res.status(500).json({ error: 'Could not load Home estimates.' });
  }
}

module.exports = { homeInsightsHandler };
