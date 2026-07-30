const db = require('../db/reconciliation');
const {
  AUD_RECONCILIATION_TOLERANCE,
  calculateReconciliation,
} = require('../lib/account-reconciliation');

function createReconciliationService(database) {
  return async function reconcileAccounts(userId, options = {}) {
    const tolerance = options.tolerance ?? AUD_RECONCILIATION_TOLERANCE;
    const evidenceComplete = options.evidenceComplete !== false;
    const { accounts, transactions } = await database.loadReconciliationInputs(userId);
    const byAccount = new Map();
    for (const row of transactions) {
      const list = byAccount.get(row.account_reference) || [];
      list.push(row);
      byAccount.set(row.account_reference, list);
    }
    const results = accounts.map((account) => {
      const result = calculateReconciliation(
        account,
        byAccount.get(account.account_reference) || [],
        tolerance
      );
      if (evidenceComplete || result.status === 'insufficient_data') return result;
      return {
        ...result,
        calculated_balance: null,
        difference: null,
        status: 'insufficient_data',
        anchor_transaction_id: null,
      };
    });
    await database.saveReconciliations(userId, results, tolerance);
    return results;
  };
}

function createListReconciliationsHandler(database) {
  return async function listReconciliations(req, res) {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      return res.json({
        reconciliations: await database.listReconciliations(req.session.userId),
      });
    } catch (error) {
      console.error('/api/v1/reconciliations error:', error.message);
      return res.status(500).json({ error: 'Could not load account reconciliations.' });
    }
  };
}

module.exports = {
  createReconciliationService,
  createListReconciliationsHandler,
  listReconciliationsHandler: createListReconciliationsHandler(db),
  reconcileAccounts: createReconciliationService(db),
};
