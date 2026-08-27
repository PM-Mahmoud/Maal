'use strict';

const { normalizeMinorUnitInteger } = require('./canonical-wealth');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < String(text).length; i++) {
    const char = String(text)[i];
    if (quoted && char === '"' && String(text)[i + 1] === '"') { field += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ',') { row.push(field); field = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && String(text)[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field');
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function parseMoneyToMinor(value, field) {
  const cleaned = String(value ?? '').trim().replace(/[$,\s]/g, '');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(cleaned)) throw new Error(`${field} must be a monetary amount with at most 2 decimals`);
  const negative = cleaned.startsWith('-');
  const [whole, decimals = ''] = cleaned.replace('-', '').split('.');
  return normalizeMinorUnitInteger(`${negative ? '-' : ''}${whole}${decimals.padEnd(2, '0')}`);
}

function addDecimalStrings(values, scale = 10) {
  const total = values.reduce((sum, value) => {
    const negative = String(value).startsWith('-');
    const [whole, fraction = ''] = String(value).replace('-', '').split('.');
    const scaled = BigInt(whole) * (10n ** BigInt(scale)) + BigInt(fraction.padEnd(scale, '0'));
    return sum + (negative ? -scaled : scaled);
  }, 0n);
  const negative = total < 0n;
  const absolute = negative ? -total : total;
  const divisor = 10n ** BigInt(scale);
  const fraction = String(absolute % divisor).padStart(scale, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${absolute / divisor}${fraction ? `.${fraction}` : ''}`;
}

function consolidateHoldings(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = instrumentMatchKey(row.instrument);
    const current = groups.get(key);
    if (!current) { groups.set(key, { ...row, matchKey: key }); continue; }
    current.units = addDecimalStrings([current.units, row.units]);
    current.costBasisMinor = String(BigInt(current.costBasisMinor) + BigInt(row.costBasisMinor));
    current.valueMinor = String(BigInt(current.valueMinor) + BigInt(row.valueMinor));
    // Only sum the AUD presentation value when BOTH sides have one; if either is
    // absent the consolidated presentation value is unknown, so leave it null
    // rather than calling BigInt(null) (which throws) or reporting a partial sum.
    if (current.presentationValueMinor != null && row.presentationValueMinor != null) {
      current.presentationValueMinor = String(BigInt(current.presentationValueMinor) + BigInt(row.presentationValueMinor));
    } else {
      current.presentationValueMinor = null;
    }
  }
  return [...groups.values()];
}

function normalizeStatementImport({ kind, csv, accountName, institution, asOf, source = 'statement_import', fxSource = null, fxRate = null }) {
  if (!['brokerage', 'super'].includes(kind)) throw new Error('Statement kind must be brokerage or super');
  const parsed = parseCsv(csv);
  if (parsed.length < 2) throw new Error('Statement must contain a header and at least one row');
  const headers = parsed[0].map(normalizeHeader);
  const records = parsed.slice(1).map((values, index) => Object.fromEntries(headers.map((header, column) => [header, String(values[column] ?? '').trim()])));
  const observedAt = new Date(asOf);
  if (Number.isNaN(observedAt.getTime())) throw new Error('Statement asOf must be a valid date');
  const normalizedAsOf = observedAt.toISOString();
  const currency = String(records[0].currency || 'AUD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be an ISO 4217 code');

  const account = {
    accountType: kind === 'super' ? 'super' : 'brokerage',
    name: String(accountName || (kind === 'super' ? 'Super account' : 'Brokerage account')).trim(),
    institution: String(institution || '').trim() || null,
    currency,
    source,
    confidence: 0.9,
    asOf: normalizedAsOf,
  };
  if (!account.name) throw new Error('Account name is required');

  const holdings = records.map((record, index) => {
    const rowNumber = index + 2;
    const name = record.name || record.security || record.fund || record.description;
    if (!name) throw new Error(`Row ${rowNumber}: security or fund name is required`);
    const units = record.units || record.quantity;
    if (!units || !/^-?\d+(?:\.\d{1,10})?$/.test(units)) throw new Error(`Row ${rowNumber}: units must have at most 10 decimals`);
    const rowCurrency = String(record.currency || currency).toUpperCase();
    if (rowCurrency !== currency) throw new Error(`Row ${rowNumber}: mixed account currencies require separate imports`);
    const value = record.market_value || record.value || record.balance;
    const presentationValueMinor = rowCurrency === 'AUD' ? null : parseMoneyToMinor(record.aud_market_value, `Row ${rowNumber} AUD market value`);
    if (rowCurrency !== 'AUD' && (!fxSource || !(Number(fxRate) > 0))) throw new Error(`Row ${rowNumber}: non-AUD values require fxSource and a positive fxRate`);
    return {
      instrument: {
        name,
        instrumentType: record.instrument_type || record.type || (kind === 'super' ? 'super_option' : 'other'),
        ticker: record.ticker || null,
        isin: record.isin || null,
        apir: record.apir || null,
        exchange: record.exchange || null,
        currency: rowCurrency,
      },
      units,
      costBasisMinor: parseMoneyToMinor(record.cost_basis || '0', `Row ${rowNumber} cost basis`),
      valueMinor: parseMoneyToMinor(value, `Row ${rowNumber} market value`),
      presentationValueMinor,
      presentationCurrency: rowCurrency === 'AUD' ? null : 'AUD',
      fxSource: rowCurrency === 'AUD' ? null : fxSource,
      fxRate: rowCurrency === 'AUD' ? null : String(fxRate),
      fxAsOf: rowCurrency === 'AUD' ? null : normalizedAsOf,
      currency: rowCurrency,
      asOf: normalizedAsOf,
      source,
      confidence: 0.9,
      rowNumber,
    };
  });
  return { account, holdings: consolidateHoldings(holdings) };
}

function instrumentMatchKey(instrument) {
  if (instrument.isin) return `isin:${instrument.isin.toUpperCase()}`;
  if (instrument.apir) return `apir:${instrument.apir.toUpperCase()}`;
  if (instrument.ticker && instrument.exchange) return `ticker:${instrument.exchange.toUpperCase()}:${instrument.ticker.toUpperCase()}`;
  return `name:${instrument.name.trim().toLowerCase()}:${instrument.currency.toUpperCase()}`;
}

module.exports = { parseCsv, normalizeStatementImport, instrumentMatchKey, consolidateHoldings };
