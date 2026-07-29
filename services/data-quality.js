const { checkTransactions, checkAccounts } = require('../lib/data-quality');

const TRANSACTION_CHECKS = [
  'transaction.invalid_amount',
  'transaction.invalid_date',
  'transaction.future_date',
  'transaction.duplicate_external_id',
  'transaction.missing_reference',
];
const ACCOUNT_CHECKS = [
  'account.invalid_balance',
  'account.missing_freshness',
  'account.stale',
  'account.duplicate_reference',
  'account.missing_reference',
];
const ALL_CHECKS = [...TRANSACTION_CHECKS, ...ACCOUNT_CHECKS];

function createDataQualityService(dependencies) {
  const {
    getTransactionsForQuality,
    listBasiqAccountsForQuality,
    syncFindings,
    getDataHealth,
    recordDataQualityFailure,
  } = dependencies;

  return {
    async run(userId, options = {}) {
      const [transactions, accounts] = await Promise.all([
        getTransactionsForQuality(userId),
        listBasiqAccountsForQuality(userId),
      ]);
      const findings = [
        ...checkTransactions(transactions, { now: options.now }),
        ...checkAccounts(accounts, {
          now: options.now,
          staleAfterDays: options.staleAfterDays,
        }),
        ...(options.additionalFindings || []),
      ];
      const coverage = options.coverage || { transactions: 'complete', accounts: 'complete' };
      const evaluatedChecks = [
        ...(coverage.transactions === 'complete' ? TRANSACTION_CHECKS : []),
        ...(coverage.accounts === 'complete' ? ACCOUNT_CHECKS : []),
        ...(options.additionalEvaluatedCheckCodes || []),
      ];
      const run = await syncFindings(userId, findings, evaluatedChecks, {
        trigger: options.trigger || 'manual',
        coverage,
        message: options.message || null,
      });
      return { ...run, checked: { transactions: transactions.length, accounts: accounts.length } };
    },
    getHealth(userId) {
      return getDataHealth(userId);
    },
    recordFailure(userId, options) {
      return recordDataQualityFailure(userId, options);
    },
  };
}

function defaultService() {
  const transactionsDb = require('../db/transactions');
  const assetsDb = require('../db/assets');
  const integrityDb = require('../db/financial-integrity');
  return createDataQualityService({
    getTransactionsForQuality: transactionsDb.getTransactionsForQuality,
    listBasiqAccountsForQuality: assetsDb.listBasiqAccountsForQuality,
    syncFindings: integrityDb.syncFindings,
    getDataHealth: integrityDb.getDataHealth,
    recordDataQualityFailure: integrityDb.recordDataQualityFailure,
  });
}

async function runDataQualityChecks(userId, options) {
  return defaultService().run(userId, options);
}

async function getDataHealth(userId) {
  return defaultService().getHealth(userId);
}

async function recordDataQualityFailure(userId, options) {
  return defaultService().recordFailure(userId, options);
}

module.exports = {
  ALL_CHECKS, createDataQualityService, runDataQualityChecks,
  getDataHealth, recordDataQualityFailure,
};
