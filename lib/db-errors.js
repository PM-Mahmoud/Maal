'use strict';
// Maps Postgres errors that are the client's fault to a 400 message.
// Used by the generic /api/v1/:table writer (routes/api.js) so a POST with an
// unknown column returns a clear 400 instead of a generic 500.

// 42703 = undefined_column. Postgres message looks like:
//   column "foo" of relation "assets" does not exist
function unknownColumnMessage(err, table) {
  if (!err || err.code !== '42703') return null;
  const m = /column "([^"]+)"/.exec(String(err.message || ''));
  const col = m && /^\w+$/.test(m[1]) ? m[1] : null;
  const where = table && /^\w+$/.test(table) ? ` on ${table}` : '';
  return col ? `Unknown field "${col}"${where}` : `Unknown field${where}`;
}

module.exports = { unknownColumnMessage };
