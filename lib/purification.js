'use strict';

const METHODOLOGY = Object.freeze({
  id: 'maal-distribution-purification',
  version: '1.0.0',
  reviewStatus: 'pending_qualified_review',
  ratioRequirement: 'licensed_provider_evidence',
});

function exactMinor(value, field) {
  if (!/^-?\d+$/.test(String(value))) throw new Error(`${field} must be an exact minor-unit integer`);
  return BigInt(value);
}

function inRange(date, start, end) {
  return date >= start && date <= end;
}

function calculatePurification(input) {
  if (!input?.methodology?.version) throw new Error('A versioned methodology is required');
  const start = String(input.periodStart || '');
  const end = String(input.periodEnd || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    throw new Error('A valid purification period is required');
  }

  const warnings = [];
  const lines = [];
  const obligations = [];
  let totalDistributions = 0n;
  let totalDue = 0n;

  for (const position of input.positions || []) {
    if (!position.securityKey || !position.name) throw new Error('Each position requires a stable security key and name');
    const ratio = position.ratio;
    if (!ratio || !Number.isInteger(ratio.partsPerMillion) || !ratio.provider || !ratio.datasetVersion || !ratio.licenseReference || !ratio.asOf) {
      warnings.push(`Missing licensed purification ratio for ${position.name}`);
      continue;
    }
    if (ratio.partsPerMillion < 0 || ratio.partsPerMillion > 1000000) throw new Error(`Invalid purification ratio for ${position.name}`);

    for (const distribution of position.distributions || []) {
      const paidOn = String(distribution.paidOn || '');
      if (!inRange(paidOn, start, end) || paidOn < String(position.acquiredOn || '') || (position.disposedOn && paidOn > position.disposedOn)) continue;
      const currency = String(distribution.presentationCurrency || distribution.currency || 'AUD').toUpperCase();
      if (currency !== 'AUD') throw new Error(`Distribution ${distribution.key} requires an AUD presentation value with FX evidence`);
      const gross = exactMinor(distribution.presentationGrossMinor ?? distribution.grossMinor, `Distribution ${distribution.key}`);
      if (gross < 0n) throw new Error(`Distribution ${distribution.key} cannot be negative`);
      const due = (gross * BigInt(ratio.partsPerMillion) + 500000n) / 1000000n;
      totalDistributions += gross;
      totalDue += due;
      const line = {
        key: distribution.key,
        securityKey: position.securityKey,
        securityName: position.name,
        paidOn,
        grossMinor: gross.toString(),
        ratioPartsPerMillion: ratio.partsPerMillion,
        amountDueMinor: due.toString(),
        provider: ratio.provider,
        datasetVersion: ratio.datasetVersion,
        licenseReference: ratio.licenseReference,
        ratioAsOf: ratio.asOf,
        source: distribution.source || null,
      };
      lines.push(line);
      obligations.push({ key: `${position.securityKey}:${distribution.key}`, ...line, status: 'outstanding' });
    }
  }

  return {
    methodologyId: input.methodology.id,
    methodologyVersion: input.methodology.version,
    methodologyReviewStatus: input.methodology.reviewStatus,
    periodStart: start,
    periodEnd: end,
    status: warnings.length ? 'unavailable' : 'calculated',
    totalDistributionsMinor: totalDistributions.toString(),
    totalDueMinor: warnings.length ? null : totalDue.toString(),
    lines,
    obligations,
    warnings,
    disclaimer: 'Purification ratios calculate an obligation from licensed data; they are not a halal endorsement or investment recommendation.',
  };
}

module.exports = { METHODOLOGY, calculatePurification };
