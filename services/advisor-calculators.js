'use strict';

const { definitions, validateCalculator, runCalculator } = require('../lib/advisor-calculators');
const { safeError } = require('../lib/safe-log');
const assets = require('../db/assets');
const { getProfileByUserId } = require('../db/profiles');

function forAccount(userId, profile, signal) {
  return {
    definitions,
    async run(name, args) {
      validateCalculator(name, args);
      signal?.throwIfAborted();
      const debts = name === 'debt_payoff' ? await assets.listDebts(userId) : [];
      signal?.throwIfAborted();
      return runCalculator(name, args, { profile, debts });
    },
  };
}

async function calculatorHandler(req, res) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const name = req.params.name;
  const args = req.body ?? {};
  try {
    validateCalculator(name, args);
  } catch (error) {
    return res.status(error instanceof RangeError ? 404 : 400).json({ error: error.message });
  }

  try {
    const [record, summary] = await Promise.all([getProfileByUserId(userId), assets.getAssetSummary(userId)]);
    const profile = assets.mergeAssetSummaryIntoProfile(record, summary);
    const result = await forAccount(userId, profile).run(name, args);
    return res.status(result.error ? 422 : 200).json(result);
  } catch (error) {
    console.error('[calculators] Calculation failed:', safeError(error));
    return res.status(500).json({ error: 'Could not run this calculation.' });
  }
}

module.exports = { forAccount, calculatorHandler };
