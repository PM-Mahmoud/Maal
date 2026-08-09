'use strict';

const REQUIRED_METHODS = ['isConfigured', 'getAuthorizationUrl', 'exchangeAuthorizationCode', 'refreshTokens', 'getAccounts', 'getTransactions', 'getBalance'];

function validateProviderAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new Error('Provider adapter is required');
  const manifest = adapter.manifest;
  if (!manifest || !/^[a-z][a-z0-9_-]+$/.test(manifest.id || '')) throw new Error('Provider manifest requires a stable id');
  if (!manifest.name || !manifest.region) throw new Error('Provider manifest requires name and region');
  if (!Array.isArray(manifest.scopes) || !manifest.scopes.length) throw new Error('Provider manifest requires explicit scopes');
  for (const method of REQUIRED_METHODS) {
    if (typeof adapter[method] !== 'function') throw new Error(`Provider adapter ${manifest.id} is missing ${method}()`);
  }
  if (manifest.capabilities?.includes('holdings') && typeof adapter.getHoldings !== 'function') {
    throw new Error(`Provider adapter ${manifest.id} declares holdings but is missing getHoldings()`);
  }
  return Object.freeze({ ...manifest, scopes: Object.freeze([...manifest.scopes]) });
}

function createProviderRegistry(adapters) {
  const registry = new Map();
  for (const adapter of adapters || []) {
    const manifest = validateProviderAdapter(adapter);
    if (registry.has(manifest.id)) throw new Error(`Duplicate provider adapter: ${manifest.id}`);
    registry.set(manifest.id, { ...adapter, manifest });
  }
  return Object.freeze({
    get(id) { return registry.get(id) || null; },
    manifests() { return [...registry.values()].map((adapter) => adapter.manifest); },
  });
}

module.exports = { REQUIRED_METHODS, validateProviderAdapter, createProviderRegistry };
