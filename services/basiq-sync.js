const basiq = require('./basiq');
const {
  basiqAccountReference,
  mapBasiqAccount,
  shapeBasiqAssetRow,
} = require('../lib/basiq-mapping');
const { classifyAccountType } = require('../lib/connected');
const { checkAccounts, checkTransactions, payloadHash } = require('../lib/data-quality');
const { findUserById } = require('../db/users');
const transactionsDb = require('../db/transactions');
const integrityDb = require('../db/financial-integrity');
const qualityService = require('./data-quality');
const { replaceBasiqAccounts } = require('../db/basiq-import');

function providerRecordKey(record, entityType, index = 0) {
  return record.id
    ? String(record.id)
    : `missing:${entityType}:${index}:${payloadHash(record).slice(0, 16)}`;
}

function rawAccountProjection(account, observedAt, key = providerRecordKey(account, 'account')) {
  return {
    id: key,
    account_reference: account.id ? `basiq:${account.id}` : '',
    balance: account.balance,
    source: 'basiq',
    updated_at: observedAt,
  };
}

function rawTransactionProjection(transaction, key = providerRecordKey(transaction, 'transaction')) {
  return {
    id: key,
    basiq_id: transaction.id,
    amount: transaction.amount,
    post_date: (transaction.postDate || transaction.transactionDate || '').slice(0, 10) || null,
    source: 'basiq',
  };
}

function namespaceSourceFindings(findings) {
  return findings.map((item) => ({
    ...item,
    check_code: `source.basiq.${item.check_code}`,
    entity_type: `source_${item.entity_type}`,
  }));
}

function invalidEntityKeys(findings, entityType) {
  return new Set(
    findings
      .filter((item) => item.entity_type === entityType && item.severity === 'error')
      .map((item) => item.entity_key)
  );
}

async function appendRawBatch(
  userId, entityType, keyedRecords, observedAt, integrity, assertOwnership
) {
  for (const { record, key } of keyedRecords) {
    await assertOwnership();
    await integrity.appendRawRecord(userId, {
      source: 'basiq',
      entityType,
      sourceRecordId: key,
      payload: record,
      observedAt,
    });
  }
}

function shapeAccounts(accounts, classify) {
  return accounts.map((account) => {
    const mapped = mapBasiqAccount(account);
    const { bucket, row } = shapeBasiqAssetRow(mapped, classify);
    return { linked: mapped, bucket, row };
  });
}

async function syncBasiqDataWith(userId, dependencies, options = {}) {
  const {
    provider, findUser, transactions, integrity, quality, classify, replaceAccounts, reconciliation,
  } = dependencies;
  const assertOwnership = options.assertOwnership || (async () => null);
  const withFence = options.withFence || (async (mutation) => {
    await assertOwnership();
    return mutation();
  });
  const user = await findUser(userId);
  if (!user?.basiq_user_id) throw new Error('No Basiq account linked');

  const observedAt = new Date().toISOString();
  const checkpoints = options.checkpoints || {};
  let accountCount;
  let sourceAccountFindings;
  if (checkpoints.accounts) {
    ({ account_count: accountCount, source_findings: sourceAccountFindings } = checkpoints.accounts);
  } else {
    const rawAccounts = await provider.getAccounts(user.basiq_user_id);
    await assertOwnership();
    const keyedAccounts = rawAccounts.map((record, index) => ({
      record, key: providerRecordKey(record, 'account', index),
    }));
    await withFence(() => appendRawBatch(
      userId, 'account', keyedAccounts, observedAt, integrity, async () => null
    ));
    sourceAccountFindings = namespaceSourceFindings(checkAccounts(
      keyedAccounts.map(({ record, key }) => rawAccountProjection(record, observedAt, key)),
      { now: observedAt }
    ));
    const invalidAccounts = invalidEntityKeys(sourceAccountFindings, 'source_account');
    const validAccounts = keyedAccounts
      .filter(({ record, key }) => record.id && !invalidAccounts.has(key))
      .map(({ record }) => record);
    const quarantinedReferences = keyedAccounts
      .filter(({ record, key }) => record.id && invalidAccounts.has(key))
      .map(({ record }) => `basiq:${record.id}`);
    await withFence(() => replaceAccounts(
      userId, shapeAccounts(validAccounts, classify), quarantinedReferences
    ));
    accountCount = validAccounts.length;
    await options.onProgress?.(
      'accounts',
      { imported: accountCount, quarantined: quarantinedReferences.length },
      { account_count: accountCount, source_findings: sourceAccountFindings }
    );
  }

  let transactionCount;
  let transactionCoverage;
  let transactionMessage;
  let transactionError;
  let sourceTransactionFindings;
  let invalidTransactionCount;
  let hasUnlinkedTransactions;
  if (checkpoints.transactions) {
    ({
      transaction_count: transactionCount,
      coverage: transactionCoverage,
      message: transactionMessage,
      source_findings: sourceTransactionFindings,
      invalid_count: invalidTransactionCount,
      has_unlinked: hasUnlinkedTransactions,
    } = checkpoints.transactions);
  } else {
    let rawTransactions = [];
    transactionCoverage = 'complete';
    transactionMessage = null;
    try {
      rawTransactions = await provider.getTransactions(user.basiq_user_id, 100);
      await assertOwnership();
    } catch (error) {
      transactionCoverage = 'failed';
      transactionError = error;
      transactionMessage = `Transaction import failed: ${error.message}`;
    }
    const keyedTransactions = rawTransactions.map((record, index) => ({
      record, key: providerRecordKey(record, 'transaction', index),
    }));
    await withFence(() => appendRawBatch(
      userId, 'transaction', keyedTransactions, observedAt, integrity, async () => null
    ));
    sourceTransactionFindings = namespaceSourceFindings(checkTransactions(
      keyedTransactions.map(({ record, key }) => rawTransactionProjection(record, key)),
      { now: observedAt }
    ));
    const invalidTransactions = invalidEntityKeys(sourceTransactionFindings, 'source_transaction');
    invalidTransactionCount = invalidTransactions.size;
    const validTransactions = keyedTransactions
      .filter(({ record, key }) => record.id && !invalidTransactions.has(key))
      .map(({ record }) => record);
    hasUnlinkedTransactions = validTransactions.some(
      (transaction) => !basiqAccountReference(
        transaction.account || (transaction.links && transaction.links.account)
      )
    );
    transactionCount = 0;
    if (transactionCoverage === 'complete') {
      try {
        transactionCount = await withFence(
          () => transactions.upsertBasiqTransactions(userId, validTransactions)
        );
      } catch (error) {
        transactionCoverage = 'failed';
        transactionError = error;
        transactionMessage = `Transaction persistence failed: ${error.message}`;
      }
    }
    await options.onProgress?.(
      'transactions',
      {
        imported: transactionCount,
        coverage: transactionCoverage,
        quarantined: invalidTransactionCount,
      },
      transactionCoverage === 'complete' ? {
        transaction_count: transactionCount,
        coverage: transactionCoverage,
        message: transactionMessage,
        source_findings: sourceTransactionFindings,
        invalid_count: invalidTransactionCount,
        has_unlinked: hasUnlinkedTransactions,
      } : null
    );
  }

  let reconciliationCoverage;
  if (checkpoints.reconciliation) {
    reconciliationCoverage = checkpoints.reconciliation.coverage;
    transactionMessage = checkpoints.reconciliation.message || transactionMessage;
  } else {
    reconciliationCoverage = transactionCoverage === 'complete' ? 'complete' : 'not_run';
    if (transactionCoverage === 'complete') {
      try {
        await withFence(() => reconciliation.reconcileAccounts(userId, {
          evidenceComplete: invalidTransactionCount === 0 && !hasUnlinkedTransactions,
        }));
        if (invalidTransactionCount > 0 || hasUnlinkedTransactions) {
          reconciliationCoverage = 'incomplete';
        }
      } catch (error) {
        reconciliationCoverage = 'failed';
        transactionMessage = `Account reconciliation failed: ${error.message}`;
      }
    }
    const reconciliationCheckpoint = {
      coverage: reconciliationCoverage, message: transactionMessage,
    };
    await options.onProgress?.(
      'reconciliation',
      { coverage: reconciliationCoverage },
      ['complete', 'incomplete'].includes(reconciliationCoverage)
        ? reconciliationCheckpoint
        : null
    );
  }

  const coverage = {
    accounts: 'complete',
    transactions: transactionCoverage,
    reconciliation: reconciliationCoverage,
  };
  let dataHealth = checkpoints.quality?.data_health || null;
  if (!checkpoints.quality) try {
    dataHealth = await withFence(() => quality.runDataQualityChecks(userId, {
      trigger: 'basiq_sync',
      coverage,
      message: transactionMessage,
      additionalFindings: [...sourceAccountFindings, ...sourceTransactionFindings],
      additionalEvaluatedCheckCodes: [
        ...qualityService.ALL_CHECKS
          .filter((code) => code.startsWith('account.'))
          .map((code) => `source.basiq.${code}`),
        ...(transactionCoverage === 'complete'
          ? qualityService.ALL_CHECKS
            .filter((code) => code.startsWith('transaction.'))
            .map((code) => `source.basiq.${code}`)
          : []),
      ],
    }));
  } catch (error) {
    try {
      await withFence(() => quality.recordDataQualityFailure(userId, {
        trigger: 'basiq_sync',
        coverage,
        message: error.message,
      }));
    } catch (recordError) {
      console.error('Could not record post-Basiq quality failure:', recordError.message);
    }
  }
  if (!checkpoints.quality) {
    await options.onProgress?.(
      'quality',
      { status: dataHealth?.status || 'failed' },
      transactionCoverage === 'failed' || reconciliationCoverage === 'failed'
        ? null
        : { data_health: dataHealth }
    );
  }

  if (transactionCoverage === 'failed' || reconciliationCoverage === 'failed') {
    const error = new Error(transactionMessage || 'Basiq import was incomplete');
    error.code = 'BASIQ_IMPORT_INCOMPLETE';
    if (transactionError) {
      error.cause = transactionError;
      for (const key of ['provider', 'status', 'path', 'providerCode']) {
        if (transactionError[key] !== undefined) error[key] = transactionError[key];
      }
    }
    throw error;
  }

  return {
    accounts: accountCount,
    transactions: transactionCount,
    coverage,
    data_health: dataHealth,
  };
}

const defaultDependencies = {
  provider: basiq,
  findUser: findUserById,
  transactions: transactionsDb,
  integrity: integrityDb,
  quality: qualityService,
  classify: classifyAccountType,
  replaceAccounts: replaceBasiqAccounts,
  reconciliation: require('./reconciliation'),
};

function createBasiqSyncService(dependencies) {
  return {
    sync(userId, options) {
      return syncBasiqDataWith(userId, dependencies, options);
    },
  };
}

async function syncBasiqData(userId, options) {
  return syncBasiqDataWith(userId, defaultDependencies, options);
}

module.exports = {
  providerRecordKey, rawAccountProjection, rawTransactionProjection,
  namespaceSourceFindings, invalidEntityKeys,
  createBasiqSyncService, syncBasiqData,
};
