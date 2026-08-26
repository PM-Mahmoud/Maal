'use strict';

const GRANT_ROLES = Object.freeze(['accountant', 'adviser']);
const READ_SCOPES = Object.freeze(['overview', 'transactions', 'documents', 'tax_export']);
const DELETION_CONFIRMATION = 'DELETE MY ACCOUNT';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeHouseholdName(name) {
  const value = String(name || '').trim();
  if (!value) throw new Error('Household name is required.');
  return value.slice(0, 120);
}

function normalizeOwnership(value) {
  const ownership = value === undefined || value === null || value === '' ? 100 : Number(value);
  if (!Number.isFinite(ownership) || ownership < 0 || ownership > 100) {
    throw new Error('Ownership must be between 0 and 100.');
  }
  return Math.round(ownership * 100) / 100;
}

function normalizeGrant(input = {}) {
  const email = normalizeEmail(input.email || input.granteeEmail);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('A valid grantee email is required.');
  }

  const role = String(input.role || '').trim().toLowerCase();
  if (!GRANT_ROLES.includes(role)) throw new Error('Grant role must be accountant or adviser.');

  const requestedScopes = Array.isArray(input.scopes) ? input.scopes : ['overview'];
  const scopes = [...new Set(requestedScopes.map((scope) => String(scope).trim().toLowerCase()))];
  if (!scopes.length || scopes.some((scope) => !READ_SCOPES.includes(scope))) {
    throw new Error('Grant scopes must be overview, transactions, documents, or tax_export.');
  }

  let expiresAt = input.expiresAt || input.expires_at || null;
  if (expiresAt) {
    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime()) || parsed <= new Date()) {
      throw new Error('Grant expiry must be a future date.');
    }
    expiresAt = parsed.toISOString();
  }

  return { email, role, scopes, expiresAt };
}

function isGrantActive(grant, now = new Date()) {
  if (!grant || grant.status !== 'active') return false;
  if (!grant.grantee_user_id && !grant.granteeUserId) return false;
  if (!grant.expires_at && !grant.expiresAt) return true;
  const expiry = new Date(grant.expires_at || grant.expiresAt);
  return !Number.isNaN(expiry.getTime()) && expiry > now;
}

function hasScope(grant, scope) {
  return isGrantActive(grant) && Array.isArray(grant.scopes) && grant.scopes.includes(scope);
}

function isDeletionConfirmed(value) {
  return String(value || '').trim().toUpperCase() === DELETION_CONFIRMATION;
}

module.exports = {
  DELETION_CONFIRMATION,
  GRANT_ROLES,
  READ_SCOPES,
  normalizeEmail,
  normalizeHouseholdName,
  normalizeOwnership,
  normalizeGrant,
  isGrantActive,
  hasScope,
  isDeletionConfirmed,
};
