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

async function appendRawBatch(userId, entityType, keyedRecords, observedAt, integrity) {
  for (const { record, key } of keyedRecords) {
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

async function syncBasiqDataWith(userId, dependencies) {
  const {
    provider, findUser, transactions, integrity, quality, classify, replaceAccounts, reconciliation,
  } = dependencies;
  const user = await findUser(userId);
  if (!user?.basiq_user_id) throw new Error('No Basiq account linked');

  const observedAt = new Date().toISOString();
  const rawAccounts = await provider.getAccounts(user.basiq_user_id);
  const keyedAccounts = rawAccounts.map((record, index) => ({
    record, key: providerRecordKey(record, 'account', index),
  }));
  await appendRawBatch(userId, 'account', keyedAccounts, observedAt, integrity);
  const sourceAccountFindings = namespaceSourceFindings(checkAccounts(
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
  await replaceAccounts(userId, shapeAccounts(validAccounts, classify), quarantinedReferences);

  let rawTransactions = [];
  let transactionCoverage = 'complete';
  let transactionMessage = null;
  try {
    rawTransactions = await provider.getTransactions(user.basiq_user_id, 100);
  } catch (error) {
    transactionCoverage = 'failed';
    transactionMessage = `Transaction import failed: ${error.message}`;
  }

  const keyedTransactions = rawTransactions.map((record, index) => ({
    record, key: providerRecordKey(record, 'transaction', index),
  }));
  await appendRawBatch(userId, 'transaction', keyedTransactions, observedAt, integrity);
  const sourceTransactionFindings = namespaceSourceFindings(checkTransactions(
    keyedTransactions.map(({ record, key }) => rawTransactionProjection(record, key)),
    { now: observedAt }
  ));
  const invalidTransactions = invalidEntityKeys(sourceTransactionFindings, 'source_transaction');
  const validTransactions = keyedTransactions
    .filter(({ record, key }) => record.id && !invalidTransactions.has(key))
    .map(({ record }) => record);
  const hasUnlinkedTransactions = validTransactions.some(
    (transaction) => !basiqAccountReference(
      transaction.account || (transaction.links && transaction.links.account)
    )
  );
  let transactionCount = 0;
  if (transactionCoverage === 'complete') {
    try {
      transactionCount = await transactions.upsertBasiqTransactions(userId, validTransactions);
    } catch (error) {
      transactionCoverage = 'failed';
      transactionMessage = `Transaction persistence failed: ${error.message}`;
    }
  }

  let reconciliationCoverage = transactionCoverage === 'complete' ? 'complete' : 'not_run';
  if (transactionCoverage === 'complete') {
    try {
      await reconciliation.reconcileAccounts(userId, {
        evidenceComplete: invalidTransactions.size === 0 && !hasUnlinkedTransactions,
      });
      if (invalidTransactions.size > 0 || hasUnlinkedTransactions) {
        reconciliationCoverage = 'incomplete';
      }
    } catch (error) {
      reconciliationCoverage = 'failed';
      transactionMessage = `Account reconciliation failed: ${error.message}`;
    }
  }

  const coverage = {
    accounts: 'complete',
    transactions: transactionCoverage,
    reconciliation: reconciliationCoverage,
  };
  let dataHealth = null;
  try {
    dataHealth = await quality.runDataQualityChecks(userId, {
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
    });
  } catch (error) {
    try {
      await quality.recordDataQualityFailure(userId, {
        trigger: 'basiq_sync',
        coverage,
        message: error.message,
      });
    } catch (recordError) {
      console.error('Could not record post-Basiq quality failure:', recordError.message);
    }
  }

  return {
    accounts: validAccounts.length,
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
    sync(userId) {
      return syncBasiqDataWith(userId, dependencies);
    },
  };
}

async function syncBasiqData(userId) {
  return syncBasiqDataWith(userId, defaultDependencies);
}

module.exports = {
  providerRecordKey, rawAccountProjection, rawTransactionProjection,
  namespaceSourceFindings, invalidEntityKeys,
  createBasiqSyncService, syncBasiqData,
};
