const db = require('../db/reconciliation');
const {
  AUD_RECONCILIATION_TOLERANCE,
  calculateReconciliation,
} = require('../lib/account-reconciliation');

function createReconciliationService(database) {
  return async function reconcileAccounts(userId, options = {}) {
    const tolerance = options.tolerance ?? AUD_RECONCILIATION_TOLERANCE;
    const evidenceComplete = options.evidenceComplete !== false;
    const [{ accounts, transactions }, adjustments] = await Promise.all([
      database.loadReconciliationInputs(userId),
      database.listAdjustments ? database.listAdjustments(userId) : [],
    ]);
    const byAdjustmentAccount = new Map();
    for (const adjustment of adjustments) {
      const current = byAdjustmentAccount.get(adjustment.account_reference) || { amount: 0 };
      byAdjustmentAccount.set(adjustment.account_reference, {
        ...adjustment, amount: Number(current.amount) + Number(adjustment.amount),
      });
    }
    const byAccount = new Map();
    for (const row of transactions) {
      const list = byAccount.get(row.account_reference) || [];
      list.push(row);
      byAccount.set(row.account_reference, list);
    }
    const results = accounts.map((account) => {
      let result = calculateReconciliation(
        account,
        byAccount.get(account.account_reference) || [],
        tolerance
      );
      const adjustment = byAdjustmentAccount.get(account.account_reference);
      if (adjustment && result.calculated_balance !== null) {
        result = applyAdjustment(result, adjustment, tolerance);
      }
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

function applyAdjustment(reconciliation, adjustment, tolerance = AUD_RECONCILIATION_TOLERANCE) {
  const adjustmentTotal = Number(adjustment.amount);
  const adjustedBalance = Number(reconciliation.calculated_balance) + adjustmentTotal;
  const difference = Number(reconciliation.provider_balance) - adjustedBalance;
  return {
    ...reconciliation, difference,
    status: Math.abs(difference) <= tolerance + 1e-9 ? 'matched' : 'mismatch',
    adjustment_total: adjustmentTotal,
    adjusted_balance: adjustedBalance,
    latest_adjustment_id: adjustment.id,
  };
}

function createAdjustmentHandler(database) {
  return async function addReconciliationAdjustment(req, res) {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    const amount = Number(req.body.amount);
    const reason = String(req.body.reason || '').trim();
    const effectiveAt = String(req.body.effective_at || '');
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(effectiveAt)
      ? new Date(`${effectiveAt}T00:00:00Z`) : null;
    const validDate = parsedDate && !Number.isNaN(parsedDate.getTime())
      && parsedDate.toISOString().slice(0, 10) === effectiveAt
      && effectiveAt <= new Date().toISOString().slice(0, 10);
    if (!Number.isFinite(amount) || amount === 0 || req.body.amount === ''
      || reason.length < 3 || reason.length > 500 || !validDate) {
      return res.status(400).json({ error: 'A non-zero amount, reason, and effective date are required.' });
    }
    try {
      const adjustment = await database.createAdjustment(req.session.userId, {
        accountReference: req.params.accountReference, amount, reason, effectiveAt,
      });
      return res.status(201).json({ adjustment });
    } catch (error) {
      if (error.code === 'RECONCILIATION_NOT_FOUND') {
        return res.status(404).json({ error: 'Reconciliation not found.' });
      }
      console.error('/api/v1/reconciliations adjustment error:', error.message);
      return res.status(500).json({ error: 'Could not create reconciliation adjustment.' });
    }
  };
}

function createListAdjustmentsHandler(database) {
  return async function listReconciliationAdjustments(req, res) {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const adjustments = await database.listAdjustments(
        req.session.userId, req.params.accountReference
      );
      return res.json({ adjustments });
    } catch (error) {
      console.error('/api/v1/reconciliations adjustments error:', error.message);
      return res.status(500).json({ error: 'Could not load reconciliation adjustments.' });
    }
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
  createAdjustmentHandler,
  createListAdjustmentsHandler,
  applyAdjustment,
  listReconciliationsHandler: createListReconciliationsHandler(db),
  adjustmentHandler: createAdjustmentHandler(db),
  listAdjustmentsHandler: createListAdjustmentsHandler(db),
  reconcileAccounts: createReconciliationService(db),
};
