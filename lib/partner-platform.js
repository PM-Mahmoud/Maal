'use strict';

const ALLOWED_SCOPES = new Set(['wealth:read', 'holdings:read', 'distributions:read', 'service_runs:write']);

function validateManifest(manifest) {
  if (!manifest?.partnerKey || !/^[a-z0-9-]+$/.test(manifest.partnerKey) || !manifest.name) throw new Error('Invalid partner manifest identity');
  for (const scope of manifest.scopes || []) if (!ALLOWED_SCOPES.has(scope)) throw new Error(`unsupported scope: ${scope}`);
  if (!Array.isArray(manifest.fields)) throw new Error('Partner manifest must declare shared fields');
  return { ...manifest, scopes: [...new Set(manifest.scopes || [])], fields: [...new Set(manifest.fields)] };
}

function visibleOfferings(offerings, governance) {
  if (!governance?.marketplaceApproved) return [];
  return offerings.filter(item => item.status === 'approved' && item.enabled === true)
    .map(validateManifest)
    .sort((a, b) => Number(a.rank || 1000) - Number(b.rank || 1000) || a.name.localeCompare(b.name));
}

function createConsent(manifest, request, now = new Date()) {
  const valid = validateManifest(manifest);
  const scopes = [...new Set(request.scopes || [])];
  const fields = [...new Set(request.fields || [])];
  if (scopes.some(scope => !valid.scopes.includes(scope))) throw new Error('Requested scope was not declared by the partner');
  if (fields.some(field => !valid.fields.includes(field))) throw new Error('Requested field was not declared by the partner');
  const days = Number(request.durationDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('Consent duration must be between 1 and 365 days');
  return { scopes, fields, grantedAt: now.toISOString(), expiresAt: new Date(now.getTime() + days * 86400000).toISOString() };
}

module.exports = { ALLOWED_SCOPES, validateManifest, visibleOfferings, createConsent };
