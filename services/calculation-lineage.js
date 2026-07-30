const database = require('../db/financial-integrity');
const {
  cashFlowLineage,
  investmentLineage,
  netWorthLineage,
  scoreLineage,
} = require('../lib/calculation-lineage');

const CALCULATION_TYPES = new Set([
  'net_worth',
  'maal_score',
  'cash_flow',
  'investment_metrics',
]);

function createCalculationLineageService(db) {
  async function recordDescriptor(userId, descriptor, effectiveAt = new Date()) {
    if (!descriptor || !CALCULATION_TYPES.has(descriptor.type)) {
      throw new Error('Unsupported calculation lineage type');
    }
    return db.recordCalculation(userId, {
      type: descriptor.type,
      version: descriptor.version,
      effectiveAt,
      inputs: descriptor.inputs,
      assumptions: descriptor.assumptions,
      result: descriptor.result,
    });
  }

  async function recordDescriptors(userId, descriptors, effectiveAt = new Date()) {
    return Promise.all(
      (descriptors || []).map((descriptor) => recordDescriptor(userId, descriptor, effectiveAt))
    );
  }

  return {
    recordDescriptor,
    recordDescriptors,
    recordScoreMetric: (userId, score, profile, effectiveAt) => (
      recordDescriptor(userId, scoreLineage(score, profile), effectiveAt)
    ),
    recordSnapshotMetrics: (userId, { snapshot, transactions, investments }, effectiveAt) => (
      recordDescriptors(userId, [
        netWorthLineage(snapshot),
        cashFlowLineage(transactions, 30),
        investmentLineage(investments),
      ], effectiveAt)
    ),
  };
}

function createListLineageHandler(db) {
  return async function listLineage(req, res) {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const type = req.query.type || null;
    if (type && !CALCULATION_TYPES.has(type)) {
      return res.status(400).json({ error: 'Unsupported calculation type' });
    }
    try {
      const calculations = await db.listCalculationLineage(req.session.userId, {
        type,
        limit: req.query.limit,
      });
      return res.json({ calculations });
    } catch (error) {
      console.error('/api/v1/calculation-lineage error:', error.message);
      return res.status(500).json({ error: 'Could not load calculation lineage.' });
    }
  };
}

const defaultService = createCalculationLineageService(database);

module.exports = {
  CALCULATION_TYPES,
  createCalculationLineageService,
  createListLineageHandler,
  listLineageHandler: createListLineageHandler(database),
  ...defaultService,
};
