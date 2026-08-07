'use strict';

const lunchflow = require('./lunchflow');
const connections = require('../db/provider-connections');
const imports = require('../db/lunchflow-import');
const { mapAccount, mapTransaction } = require('../lib/lunchflow-mapping');

function createSyncService(dependencies = {}) {
  const provider = dependencies.provider || lunchflow;
  const connectionStore = dependencies.connectionStore || connections;
  const accountStore = dependencies.accountStore || imports;
  const transactionStore = dependencies.transactionStore || imports;
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
        const rawAccounts = await provider.getAccounts(connection.access_token);
        return Promise.all(rawAccounts.map(async (account) => {
          const [balance, transactions] = await Promise.all([
            provider.getBalance(account.id, connection.access_token),
            provider.getTransactions(account.id, connection.access_token),
          ]);
          return {
            account: mapAccount(account, balance),
            transactions: transactions.map(mapTransaction).filter(Boolean),
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
      const withFence = options.withFence || (async (mutation) => mutation());
      await withFence(() => accountStore.replaceAccounts(userId, mappedAccounts));
      await options.onProgress?.('accounts', { imported: mappedAccounts.length });
      await withFence(() => transactionStore.upsertTransactions(userId, mappedTransactions));
      await options.onProgress?.('transactions', { imported: mappedTransactions.length });
      const canonical = accountStore.promoteCanonicalAccounts
        ? await withFence(() => accountStore.promoteCanonicalAccounts(userId, mappedAccounts))
        : null;
      if (canonical) await options.onProgress?.('canonical_accounts', canonical);
      return { accounts: mappedAccounts.length, transactions: mappedTransactions.length, ...(canonical ? { canonical } : {}) };
    } finally {
      activeUsers.delete(userId);
    }
  };
}

module.exports = { createSyncService, syncLunchFlow: createSyncService() };
