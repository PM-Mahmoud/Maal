'use strict';

const METHODOLOGIES = Object.freeze({
  LUNAR_V1: Object.freeze({ id: 'maal-zakat-au-lunar', version: '1.0.0', yearBasis: 'lunar', ratePartsPerMillion: 25000, reviewStatus: 'pending_qualified_review' }),
  SOLAR_V1: Object.freeze({ id: 'maal-zakat-au-solar', version: '1.0.0', yearBasis: 'solar', ratePartsPerMillion: 25775, reviewStatus: 'pending_qualified_review' }),
});

function minor(value, field) {
  if (!/^-?\d+$/.test(String(value))) throw new Error(`${field} must be an exact minor-unit integer`);
  return BigInt(value);
}

function treatmentFor(line, methodology) {
  const rules=methodology.rules||{};
  if (line.category === 'deductible_debt') {
    if (line.dueWithinMonths == null || !Number.isFinite(Number(line.dueWithinMonths))) return 'disputed';
    return Number(line.dueWithinMonths) <= Number(rules.debtDueWithinMonths ?? 12) ? 'deductible' : 'excluded';
  }
  if ((rules.eligibleCategories||['cash','listed_shares','business_inventory','gold','silver','crypto']).includes(line.category)) return 'eligible';
  if (line.category === 'super') return line.accessible === true ? 'eligible' : (line.confirmed ? 'excluded' : 'disputed');
  if (line.category === 'property') {
    if (line.propertyIntention === 'trading_inventory') return 'eligible';
    if (['rental', 'personal_use'].includes(line.propertyIntention)) return 'excluded';
  }
  return 'disputed';
}

function calculateZakat(input) {
  if (!input?.methodology || !Number.isInteger(input.methodology.ratePartsPerMillion)) throw new Error('A versioned methodology is required');
  const valuationDate = new Date(`${input.valuationDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.valuationDate)) || Number.isNaN(valuationDate.getTime())) throw new Error('A valid valuation date is required');
  const nisab = minor(input.nisabMinor, 'nisabMinor');
  if (nisab <= 0n) throw new Error('nisabMinor must be positive');
  let eligibleAssets = 0n;
  let deductibleDebts = 0n;
  const unconfirmedLineKeys = [];
  const lines = (input.lines || []).map((line, index) => {
    if (!line.key) throw new Error(`Line ${index + 1} requires a stable key`);
    const currency = String(line.presentationCurrency || line.currency || 'AUD').toUpperCase();
    if (currency !== 'AUD') throw new Error(`Line ${line.key} requires an AUD presentation value with FX evidence`);
    const amount = minor(line.presentationAmountMinor ?? line.amountMinor, `Line ${line.key} amount`);
    if (amount < 0n) throw new Error(`Line ${line.key} amount cannot be negative`);
    const ownership = Number(line.ownershipPercent ?? 100);
    if (!Number.isFinite(ownership) || ownership < 0 || ownership > 100) throw new Error(`Line ${line.key} ownership must be between 0 and 100`);
    const ownedAmount = amount * BigInt(Math.round(ownership * 10000)) / 1000000n;
    const treatment = treatmentFor(line,input.methodology);
    if (treatment === 'eligible') eligibleAssets += ownedAmount;
    if (treatment === 'deductible') deductibleDebts += ownedAmount;
    if (treatment === 'disputed' || line.confirmed !== true) unconfirmedLineKeys.push(line.key);
    return {
      key: line.key, category: line.category, treatment,
      amountMinor: amount.toString(), ownershipPercent: ownership,
      ownedAmountMinor: ownedAmount.toString(), confirmed: line.confirmed === true,
      evidence: line.evidence || null,
    };
  });
  const base = eligibleAssets > deductibleDebts ? eligibleAssets - deductibleDebts : 0n;
  const aboveNisab = base >= nisab;
  const due = aboveNisab
    ? (base * BigInt(input.methodology.ratePartsPerMillion) + 500000n) / 1000000n
    : 0n;
  return {
    methodologyId: input.methodology.id,
    methodologyVersion: input.methodology.version,
    methodologyReviewStatus: input.methodology.reviewStatus,
    valuationDate: input.valuationDate,
    ratePartsPerMillion: input.methodology.ratePartsPerMillion,
    nisabMinor: nisab.toString(), eligibleAssetsMinor: eligibleAssets.toString(),
    deductibleDebtsMinor: deductibleDebts.toString(), zakatableBaseMinor: base.toString(),
    zakatDueMinor: due.toString(), aboveNisab, lines,
    unconfirmedLineKeys: [...new Set(unconfirmedLineKeys)],
    status: unconfirmedLineKeys.length ? 'needs_confirmation' : 'calculated',
    disclaimer: 'Educational calculation only. Zakat methodology and disputed classifications require user confirmation and qualified scholarly review.',
  };
}

function canonicalZakatLines(snapshot) {
  const { latestValuations } = require('./canonical-wealth');
  const categories = { cash: 'cash', investment: 'listed_shares', property: 'property', property_mortgage: 'deductible_debt', debt: 'deductible_debt', super: 'super', other_asset: 'other_asset' };
  const ownership = new Map();
  for (const interest of snapshot.ownershipInterests || []) {
    const key = `${interest.subject_type || interest.subjectType}:${interest.subject_key || interest.subjectKey}`;
    ownership.set(key,(ownership.get(key)||0)+Number(interest.ownership_percent ?? interest.ownershipPercent));
  }
  return latestValuations((snapshot.valuations||[]).map(row=>({...row,subjectType:row.subjectType||row.subject_type,subjectKey:row.subjectKey||row.subject_key,amountMinor:row.amountMinor??row.amount_minor,asOf:row.asOf||row.as_of}))).filter(row=>categories[row.classification]).map(row=>{
    const currency=String(row.currency||'AUD').toUpperCase();
    const amount=currency==='AUD'?(row.amountMinor??row.amount_minor):(row.presentationAmountMinor??row.presentation_amount_minor);
    if(amount==null) throw new Error(`AUD presentation value missing for ${row.subjectKey}`);
    const category=categories[row.classification];
    return {key:`canonical:${row.id}`,category,amountMinor:String(amount),presentationCurrency:'AUD',ownershipPercent:ownership.get(`${row.subjectType}:${row.subjectKey}`)??100,confirmed:false,
      ...(category==='deductible_debt'?{dueWithinMonths:null}:{}),...(category==='property'?{propertyIntention:null}:{}),...(category==='super'?{accessible:null}:{}),
      evidence:{valuationId:row.id,subjectType:row.subjectType,subjectKey:row.subjectKey,asOf:row.asOf,source:row.source,confidence:row.confidence}};
  });
}

module.exports = { METHODOLOGIES, calculateZakat, canonicalZakatLines };
