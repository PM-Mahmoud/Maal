// lib/file-builders.js — PURE builders for AI-generated data files (PR 11).
//
// No I/O. Turns the user's REAL data (snapshots, transactions, goals, balances)
// into CSV or SpreadsheetML (an XML workbook Excel opens natively, so we get a
// real spreadsheet without a zip/xlsx dependency). The figures always come from
// the caller's own data — never fabricated. Deterministic-tested
// (test/file-builders.test.js).

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// ─── CSV ───────────────────────────────────────────────────────────────────
function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// columns: [{ key, label }]; rows: array of objects keyed by column.key.
function toCsv(columns, rows) {
  const cols = columns || [];
  const header = cols.map((c) => csvCell(c.label)).join(',');
  const body = (rows || []).map((r) => cols.map((c) => csvCell(r[c.key])).join(',')).join('\r\n');
  return body ? header + '\r\n' + body + '\r\n' : header + '\r\n';
}

// ─── SpreadsheetML (Excel 2003 XML) ─────────────────────────────────────────
function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function cellXml(value) {
  if (value == null || value === '') return '<Cell><Data ss:Type="String"></Data></Cell>';
  const isNum = typeof value === 'number' && Number.isFinite(value);
  const type = isNum ? 'Number' : 'String';
  const out = isNum ? String(value) : xmlEscape(value);
  return `<Cell><Data ss:Type="${type}">${out}</Data></Cell>`;
}

function toSpreadsheetXml(sheetName, columns, rows) {
  const cols = columns || [];
  const headerRow = '<Row>' + cols.map((c) => cellXml(String(c.label))).join('') + '</Row>';
  const dataRows = (rows || []).map((r) =>
    '<Row>' + cols.map((c) => cellXml(r[c.key])).join('') + '</Row>'
  ).join('');
  return '<?xml version="1.0"?>\n'
    + '<?mso-application progid="Excel.Sheet"?>\n'
    + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" '
    + 'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
    + `<Worksheet ss:Name="${xmlEscape(String(sheetName || 'Sheet1').slice(0, 31))}">`
    + `<Table>${headerRow}${dataRows}</Table></Worksheet></Workbook>`;
}

// ─── Datasets ───────────────────────────────────────────────────────────────
// buildDataset(name, data) → { title, sheet, columns, rows }. `data` is already
// loaded by the caller (the service), so this stays pure/testable.
const DATASETS = {
  net_worth: (data) => ({
    title: 'Net worth history',
    sheet: 'Net worth',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'net_worth', label: 'Net worth' },
      { key: 'assets', label: 'Assets' },
      { key: 'super', label: 'Super' },
      { key: 'investments', label: 'Investments' },
      { key: 'cash', label: 'Cash' },
      { key: 'debts', label: 'Debts' },
    ],
    rows: (data.snapshots || []).map((s) => ({
      date: s.snap_date ? String(s.snap_date).slice(0, 10) : '',
      net_worth: num(s.net_worth),
      assets: num(s.assets_total),
      super: num(s.super_balance),
      investments: num(s.invest_balance),
      cash: num(s.cash_balance),
      debts: num(s.debts_total),
    })),
  }),
  transactions: (data) => ({
    title: 'Transactions',
    sheet: 'Transactions',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount' },
    ],
    rows: (data.transactions || []).map((t) => ({
      date: t.date ? String(t.date).slice(0, 10) : '',
      description: t.description || t.merchant || '',
      amount: num(t.amount),
    })),
  }),
  goals: (data) => ({
    title: 'Goals',
    sheet: 'Goals',
    columns: [
      { key: 'name', label: 'Goal' },
      { key: 'category', label: 'Category' },
      { key: 'current', label: 'Current' },
      { key: 'target', label: 'Target' },
      { key: 'progress', label: 'Progress %' },
    ],
    rows: (data.goals || []).map((g) => {
      const target = num(g.target_amount != null ? g.target_amount : g.target);
      const current = num(g.current_amount != null ? g.current_amount : g.current);
      return {
        name: g.name || '',
        category: g.category || g.type || '',
        current,
        target,
        progress: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
      };
    }),
  }),
  balances: (data) => ({
    title: 'Balance summary',
    sheet: 'Balances',
    columns: [
      { key: 'category', label: 'Category' },
      { key: 'value', label: 'Value' },
    ],
    rows: (() => {
      const s = data.snap || {};
      return [
        { category: 'Cash', value: num(s.cashBalance) },
        { category: 'Investments', value: num(s.investBalance) },
        { category: 'Super', value: num(s.superBalance) },
        { category: 'Assets total', value: num(s.assetsTotal) },
        { category: 'Debts total', value: num(s.debtsTotal) },
        { category: 'Net worth', value: num(s.netWorth) },
      ];
    })(),
  }),
};

function isKnownDataset(name) {
  return Object.prototype.hasOwnProperty.call(DATASETS, name);
}

function buildDataset(name, data) {
  const fn = DATASETS[name];
  if (!fn) return null;
  return fn(data || {});
}

module.exports = {
  toCsv, csvCell, toSpreadsheetXml, xmlEscape,
  buildDataset, isKnownDataset, DATASETS,
};
