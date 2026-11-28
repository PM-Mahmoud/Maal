'use strict';
// lib/account-preferences.js — pure rules for the account "⋯" menu (HEL-42):
// Rename and Show/Hide in net worth. No I/O.
//
// Refresh and Disconnect are deliberately NOT here: they depend on the bank
// data provider's connection model, which changes with the Fiskil migration
// (Mahmoud, 29 Nov 2026).

// Table → the column that holds the account's display name.
const NAME_COLUMNS = Object.freeze({
  cash_accounts: 'label',
  investments: 'name',
  properties: 'label',
  debts: 'label',
  super_accounts: 'label',
  other_assets: 'label',
});

// Tables a provider import rewrites (see db/basiq-import.js).
const PROVIDER_MIRROR_TABLES = Object.freeze(['cash_accounts', 'investments', 'debts', 'super_accounts']);

const MAX_NAME_LENGTH = 60;

function isProviderReference(reference) {
  return /^(basiq|lunchflow):[A-Za-z0-9_-]+$/.test(String(reference || ''));
}

/**
 * Validate a preference update. Returns { ok:true, displayName, include } where
 * either field may be undefined (= leave unchanged), or { ok:false, error }.
 */
function validatePreferenceInput(table, id, body) {
  if (!Object.prototype.hasOwnProperty.call(NAME_COLUMNS, table)) {
    return { ok: false, status: 404, error: 'Not found' };
  }
  if (!/^\d{1,18}$/.test(String(id || ''))) {
    return { ok: false, status: 404, error: 'Account not found' };
  }
  const data = body && typeof body === 'object' ? body : {};
  let displayName;
  if (data.display_name !== undefined) {
    if (typeof data.display_name !== 'string') {
      return { ok: false, status: 400, error: 'Name must be text.' };
    }
    displayName = data.display_name.replace(/\s+/g, ' ').trim();
    if (!displayName) return { ok: false, status: 400, error: 'Name can’t be empty.' };
    if (displayName.length > MAX_NAME_LENGTH) {
      return { ok: false, status: 400, error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` };
    }
  }
  let include;
  if (data.include_in_net_worth !== undefined) {
    if (typeof data.include_in_net_worth !== 'boolean') {
      return { ok: false, status: 400, error: 'Show in net worth must be true or false.' };
    }
    include = data.include_in_net_worth;
  }
  if (displayName === undefined && include === undefined) {
    return { ok: false, status: 400, error: 'Nothing to change.' };
  }
  return { ok: true, nameColumn: NAME_COLUMNS[table], displayName, include };
}

module.exports = {
  NAME_COLUMNS,
  PROVIDER_MIRROR_TABLES,
  MAX_NAME_LENGTH,
  isProviderReference,
  validatePreferenceInput,
};
