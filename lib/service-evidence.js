'use strict';

const crypto = require('crypto');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((out, key) => { out[key] = canonical(value[key]); return out; }, {});
  return value;
}
function snapshotHash(snapshot) { return crypto.createHash('sha256').update(JSON.stringify(canonical(snapshot))).digest('hex'); }
function evidenceDocument(run) {
  return { schema: 'au.com.hellomaal.service-evidence.v1', generatedAt: new Date().toISOString(), run };
}
module.exports = { canonical, snapshotHash, evidenceDocument };
