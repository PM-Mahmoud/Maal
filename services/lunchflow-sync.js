'use strict';

const lunchflow = require('./lunchflow');
const connections = require('../db/provider-connections');
const imports = require('../db/lunchflow-import');
const { mapAccount, mapTransaction, mapHolding } = require('../lib/lunchflow-mapping');

function transactionWindowStart(now = new Date()) {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 120);
  return start.toISOString().slice(0, 10);
}

function createSyncService(dependencies = {}) {
  const provider = dependencies.provider || lunchflow;
  const connectionStore = dependencies.connectionStore || connections;
  const accountStore = dependencies.accountStore || imports;
  const transactionStore = dependencies.transactionStore || imports;
  const holdingStore = dependencies.holdingStore || dependencies.accountStore || imports;
  const now = dependencies.now || (() => new Date());
  const activeUsers = new Set();

  return async function syncLunchFlow(userId, options = {}) {
    if (activeUsers.has(userId)) throw new Error('Lunch Flow sync already in progress');
    activeUsers.add(userId);
    try {
      let connection = await connectionStore.getConnection(userId, 'lunchflow');
      if (!connection) throw new Error('No Lunch Flow provider connection');

      async function refreshConnection() {
        if (!connection.refresh_token) throw new Error('Lunch Flow connection needs reauthorization');
        const refreshed = await provider.refreshTokens(connection.refresh_token);
        await connectionStore.upsertConnection(userId, 'lunchflow', refreshed);
        connection = {
          ...connection,
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token || connection.refresh_token,
        };
      }

      const expiresSoon = connection.token_expires_at
        && new Date(connection.token_expires_at).getTime() <= Date.now() + 60_000;
      if (expiresSoon) await refreshConnection();

      async function loadProviderData() {
        const syncNow = now();
        const observedAt = syncNow.toISOString();
        const windowStart = transactionWindowStart(syncNow);
        const rawAccounts = await provider.getAccounts(connection.access_token);
        return Promise.all(rawAccounts.map(async (account) => {
          const [balance, transactions, holdingResponse] = await Promise.all([
            provider.getBalance(account.id, connection.access_token),
            provider.getTransactions(account.id, connection.access_token, { from: windowStart }),
            provider.getHoldings
              ? provider.getHoldings(account.id, connection.access_token)
              : { holdings: [], supported: false },
          ]);
          const holdings = Array.isArray(holdingResponse)
            ? holdingResponse
            : (holdingResponse?.holdings || []);
          return {
            account: mapAccount(account, balance),
            transactions: transactions.map(mapTransaction).filter(Boolean),
            holdings: holdings.map((holding) => mapHolding(holding, account.id, observedAt)).filter(Boolean),
            holdingsSupported: Array.isArray(holdingResponse) || holdingResponse?.supported === true,
            observedAt,
            windowStart,
          };
        }));
      }

      let accountGroups;
      try {
        accountGroups = await loadProviderData();
      } catch (error) {
        if (error.status !== 401 || !connection.refresh_token) throw error;
        await refreshConnection();
        accountGroups = await loadProviderData();
      }
      const mappedAccounts = accountGroups.map((group) => group.account).filter(Boolean);
      const mappedTransactions = accountGroups.flatMap((group) => group.transactions);
      const mappedHoldings = accountGroups.flatMap((group) => group.holdings);
      const holdingsByAccount = Object.fromEntries(accountGroups
        .filter((group) => group.holdingsSupported)
        .map((group) => [group.account.account_reference, group.holdings]));
      const unsupportedHoldingAccounts = accountGroups
        .filter((group) => !group.holdingsSupported)
        .map((group) => group.account.account_reference);
      const windowStart = accountGroups[0]?.windowStart || transactionWindowStart(now());
      const withFence = options.withFence || (async (mutation) => mutation());
      await withFence(() => accountStore.replaceAccounts(userId, mappedAccounts));
      await options.onProgress?.('accounts', { imported: mappedAccounts.length });
      await withFence(() => transactionStore.upsertTransactions(userId, mappedTransactions, {
        windowStart,
        accountReferences: mappedAccounts.map((account) => account.account_reference),
      }));
      await options.onProgress?.('transactions', { imported: mappedTransactions.length });
      const canonical = accountStore.promoteCanonicalAccounts
          ? await withFence(() => accountStore.promoteCanonicalAccounts(userId, mappedAccounts, {
            holdingsByAccount,
            unsupportedHoldingAccounts,
            observedAt: accountGroups[0]?.observedAt || now().toISOString(),
          }))
        : null;
      if (canonical) await options.onProgress?.('canonical_accounts', canonical);
      const holdings = holdingStore.replaceHoldings
          ? await withFence(() => holdingStore.replaceHoldings(userId, mappedHoldings, {
            accountReferences: Object.keys(holdingsByAccount),
            observedAt: accountGroups[0]?.observedAt || now().toISOString(),
          }))
        : { holdings: 0 };
      await options.onProgress?.('holdings', holdings);
      return {
        accounts: mappedAccounts.length,
        transactions: mappedTransactions.length,
        holdings: Number(holdings?.holdings || 0),
        ...(canonical ? { canonical } : {}),
      };
    } finally {
      activeUsers.delete(userId);
    }
  };
}

module.exports = { transactionWindowStart, createSyncService, syncLunchFlow: createSyncService() };
