'use strict';

// Pure compatibility projection from the seven legacy asset tables to the
// canonical W1.2 records. Persistence lives in scripts/backfill-canonical-wealth.js;
// keeping this boundary pure makes parity independently testable.

function moneyToMinor(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function minorToMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number / 100 : 0;
}

function normalizeMinorUnitInteger(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('amount_minor must be a signed 64-bit integer string or safe integer');
  const text = String(value);
  if (!/^-?\d+$/.test(text)) throw new Error('amount_minor must be a signed 64-bit integer');
  const parsed = BigInt(text);
  if (parsed < -9223372036854775808n || parsed > 9223372036854775807n) throw new Error('amount_minor must be a signed 64-bit integer');
  return text;
}

function observedAt(row) {
  const raw = row.updated_at || row.created_at;
  if (!raw) return '1970-01-01T00:00:00.000Z';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? String(raw) : date.toISOString();
}

function provenance(row) {
  const source = row.source || 'legacy';
  const confidence = source === 'basiq' ? 0.95 : source === 'import' ? 0.9 : source === 'manual' ? 0.7 : 0.5;
  return { source, confidence };
}

function projectLegacyWealthRows(userId, rows = {}) {
  const result = { accounts: [], instruments: [], holdings: [], valuations: [], ownershipInterests: [] };
  const currencyOf = (row) => String(row.currency || 'AUD').toUpperCase();

  function addOwnership(subjectType, subjectKey, table, row) {
    result.ownershipInterests.push({
      userId,
      subjectType,
      subjectKey,
      ownerType: 'self',
      ownershipPercent: 100,
      effectiveFrom: observedAt(row),
      legacyKey: `${table}:${row.id}:ownership`,
    });
  }

  function addValuation({ row, table, id, subjectType, subjectKey, classification, amount, suffix = 'valuation' }) {
    const { source, confidence } = provenance(row);
    result.valuations.push({
      userId,
      subjectType,
      subjectKey,
      classification,
      amountMinor: moneyToMinor(amount),
      currency: currencyOf(row),
      asOf: observedAt(row),
      source,
      confidence,
      legacyKey: `${table}:${id}:${suffix}:${observedAt(row)}`,
    });
  }

  function addAccount(row, table, accountType, name, classification, amountField) {
    const key = `${table}:${row.id}:account`;
    const { source, confidence } = provenance(row);
    result.accounts.push({
      userId,
      accountType,
      name,
      institution: row.institution || row.fund_name || null,
      currency: currencyOf(row),
      source,
      confidence,
      asOf: observedAt(row),
      legacyKey: key,
    });
    addValuation({ row, table, id: row.id, subjectType: 'financial_account', subjectKey: key, classification, amount: row[amountField] });
    addOwnership('financial_account', key, table, row);
    return key;
  }

  for (const row of rows.cashAccounts || []) {
    addAccount(row, 'cash_accounts', 'cash', row.label || 'Cash account', 'cash', 'balance');
  }

  for (const row of rows.investments || []) {
    const accountKey = addAccount(row, 'investments', 'brokerage', `${row.name || 'Investment'} account`, 'investment', 'value');
    const instrumentKey = `investments:${row.id}:instrument`;
    result.instruments.push({
      userId,
      name: row.name || 'Investment',
      instrumentType: row.kind || 'other',
      ticker: row.ticker || null,
      currency: currencyOf(row),
      legacyKey: instrumentKey,
    });
    result.holdings.push({
      userId,
      accountKey,
      instrumentKey,
      units: String(row.units ?? '0'),
      costBasisMinor: moneyToMinor(row.cost_basis),
      currency: currencyOf(row),
      asOf: observedAt(row),
      source: provenance(row).source,
      confidence: provenance(row).confidence,
      legacyKey: `investments:${row.id}:holding:${observedAt(row)}`,
    });
  }

  for (const row of rows.superAccounts || []) {
    addAccount(row, 'super_accounts', 'super', row.label || row.fund_name || 'Super account', 'super', 'balance');
  }

  for (const row of rows.debts || []) {
    addAccount(row, 'debts', 'liability', row.label || 'Debt', 'debt', 'balance');
  }

  for (const row of rows.properties || []) {
    const subjectKey = `properties:${row.id}`;
    addValuation({ row, table: 'properties', id: row.id, subjectType: 'property', subjectKey, classification: 'property', amount: row.value });
    addValuation({ row, table: 'properties', id: row.id, subjectType: 'property', subjectKey, classification: 'property_mortgage', amount: row.mortgage_balance, suffix: 'mortgage-valuation' });
    addOwnership('property', subjectKey, 'properties', row);
  }

  for (const row of rows.otherAssets || []) {
    const subjectKey = `other_assets:${row.id}`;
    addValuation({ row, table: 'other_assets', id: row.id, subjectType: 'other_asset', subjectKey, classification: 'other_asset', amount: row.value });
    addOwnership('other_asset', subjectKey, 'other_assets', row);
  }

  return result;
}

function latestValuations(valuations = []) {
  const latest = new Map();
  for (const row of valuations) {
    const key = `${row.subjectType}:${row.subjectKey}:${row.classification}`;
    const current = latest.get(key);
    const rowTime = new Date(row.asOf).getTime();
    const currentTime = current ? new Date(current.asOf).getTime() : -Infinity;
    if (!current || rowTime > currentTime || (!Number.isFinite(rowTime) && String(row.asOf) > String(current.asOf))) latest.set(key, row);
  }
  return [...latest.values()];
}

function summarizeCanonicalSnapshot(snapshot = {}) {
  const totals = {
    cashTotal: 0,
    investmentsTotal: 0,
    propertyTotal: 0,
    propertyMortgageTotal: 0,
    debtsTotal: 0,
    superTotal: 0,
    otherAssetsTotal: 0,
  };
  const fields = {
    cash: 'cashTotal',
    investment: 'investmentsTotal',
    property: 'propertyTotal',
    property_mortgage: 'propertyMortgageTotal',
    debt: 'debtsTotal',
    super: 'superTotal',
    other_asset: 'otherAssetsTotal',
  };
  const ownership = new Map();
  for (const row of snapshot.ownershipInterests || []) {
    const subjectType = row.subjectType || row.subject_type;
    const subjectKey = row.subjectKey || row.subject_key;
    const percent = Number(row.ownershipPercent ?? row.ownership_percent);
    if (subjectType && subjectKey && Number.isFinite(percent)) {
      const key = `${subjectType}:${subjectKey}`;
      ownership.set(key, (ownership.get(key) || 0) + percent);
    }
  }
  for (const row of latestValuations(snapshot.valuations)) {
    const field = fields[row.classification];
    if (!field) continue;
    const currency = String(row.currency || 'AUD').toUpperCase();
    if (currency !== 'AUD') throw new Error(`FX conversion required before aggregating ${currency} valuation`);
    const share = ownership.has(`${row.subjectType}:${row.subjectKey}`)
      ? ownership.get(`${row.subjectType}:${row.subjectKey}`) / 100
      : 1;
    totals[field] += minorToMoney(row.amountMinor) * share;
  }
  const assetTotal = totals.cashTotal + totals.investmentsTotal + totals.propertyTotal + totals.superTotal + totals.otherAssetsTotal;
  const liabilityTotal = totals.propertyMortgageTotal + totals.debtsTotal;
  return { ...totals, assetTotal, liabilityTotal, netWorth: assetTotal - liabilityTotal };
}

function summarizeLegacy(rows = {}) {
  const sum = (items, field) => (items || []).reduce((total, row) => total + (Number(row[field]) || 0), 0);
  const assets = sum(rows.cashAccounts, 'balance') + sum(rows.investments, 'value') + sum(rows.properties, 'value') +
    sum(rows.superAccounts, 'balance') + sum(rows.otherAssets, 'value');
  const liabilities = sum(rows.properties, 'mortgage_balance') + sum(rows.debts, 'balance');
  return assets - liabilities;
}

function summarizeLegacyComponents(rows = {}) {
  const sum = (items, field) => (items || []).reduce((total, row) => total + (Number(row[field]) || 0), 0);
  const totals = {
    cashTotal: sum(rows.cashAccounts, 'balance'),
    investmentsTotal: sum(rows.investments, 'value'),
    propertyTotal: sum(rows.properties, 'value'),
    propertyMortgageTotal: sum(rows.properties, 'mortgage_balance'),
    debtsTotal: sum(rows.debts, 'balance'),
    superTotal: sum(rows.superAccounts, 'balance'),
    otherAssetsTotal: sum(rows.otherAssets, 'value'),
  };
  const assetTotal = totals.cashTotal + totals.investmentsTotal + totals.propertyTotal + totals.superTotal + totals.otherAssetsTotal;
  const liabilityTotal = totals.propertyMortgageTotal + totals.debtsTotal;
  return { ...totals, assetTotal, liabilityTotal, netWorth: assetTotal - liabilityTotal };
}

function compareLegacyAndCanonical(legacyRows, canonicalSnapshot) {
  const legacySummary = summarizeLegacyComponents(legacyRows);
  const canonicalSummary = summarizeCanonicalSnapshot(canonicalSnapshot);
  const legacyNetWorth = legacySummary.netWorth;
  const canonicalNetWorth = canonicalSummary.netWorth;
  const delta = Math.abs(canonicalNetWorth - legacyNetWorth);
  const fields = Object.keys(legacySummary);
  const matches = fields.every((field) => Math.abs(legacySummary[field] - canonicalSummary[field]) <= 0.01);
  return { legacySummary, canonicalSummary, legacyNetWorth, canonicalNetWorth, delta, matches };
}

module.exports = {
  moneyToMinor,
  minorToMoney,
  normalizeMinorUnitInteger,
  projectLegacyWealthRows,
  summarizeCanonicalSnapshot,
  compareLegacyAndCanonical,
  summarizeLegacyComponents,
};
