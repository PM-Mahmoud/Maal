function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function serializeFinancialExport(bundle, format) {
  if (format === 'json') return JSON.stringify(bundle, null, 2);
  if (format !== 'csv') throw new Error('Unsupported export format.');
  const rows = ['table,row_index,record_json'];
  for (const [table, records] of Object.entries(bundle.data || {})) {
    (records || []).forEach((record, index) => rows.push([csvCell(table), index, csvCell(JSON.stringify(record))].join(',')));
  }
  return `${rows.join('\r\n')}\r\n`;
}
module.exports = { csvCell, serializeFinancialExport };
