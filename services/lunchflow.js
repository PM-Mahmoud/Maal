'use strict';

const DEFAULT_BASE_URL = 'https://lunchflow.app';
const REQUEST_TIMEOUT_MS = 15_000;
const manifest = Object.freeze({
  id: 'lunchflow', name: 'Lunch Flow', region: 'AU',
  scopes: Object.freeze(['accounts:read', 'balances:read', 'transactions:read']),
  capabilities: Object.freeze(['accounts', 'balances', 'transactions']),
});

function config() {
  return {
    baseUrl: (process.env.LUNCHFLOW_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    clientId: (process.env.LUNCHFLOW_CLIENT_ID || '').trim(),
    clientSecret: (process.env.LUNCHFLOW_CLIENT_SECRET || '').trim(),
  };
}

function isConfigured() {
  const { clientId, clientSecret } = config();
  return !!(clientId && clientSecret);
}

function requireConfig() {
  const value = config();
  if (!value.clientId || !value.clientSecret) {
    throw new Error('Lunch Flow client credentials are not configured');
  }
  return value;
}

function getAuthorizationUrl({ redirectUri, email, state }) {
  const { baseUrl, clientId } = requireConfig();
  const url = new URL('/api/platform/oauth/authorize', baseUrl);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('email', email);
  url.searchParams.set('state', state);
  return url.toString();
}

async function tokenRequest(body) {
  const { baseUrl } = requireConfig();
  const response = await fetch(`${baseUrl}/api/platform/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (_) { /* handled below */ }
  if (!response.ok) {
    const error = new Error(`Lunch Flow ${response.status}: ${json.error_description || json.error || text.slice(0, 200)}`);
    error.status = response.status;
    error.provider = 'lunchflow';
    throw error;
  }
  return json;
}

async function exchangeAuthorizationCode({ code, redirectUri }) {
  const { clientId, clientSecret } = requireConfig();
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
}

async function refreshTokens(refreshToken) {
  const { clientId, clientSecret } = requireConfig();
  return tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
}

async function userRequest(path, accessToken) {
  const { baseUrl } = requireConfig();
  const response = await fetch(`${baseUrl}/api/platform/v1${path}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (_) { /* handled below */ }
  if (!response.ok) {
    const error = new Error(`Lunch Flow ${response.status} on ${path}: ${json.error || text.slice(0, 200)}`);
    error.status = response.status;
    error.provider = 'lunchflow';
    throw error;
  }
  return json;
}

async function getAccounts(accessToken) {
  const json = await userRequest('/accounts', accessToken);
  return Array.isArray(json) ? json : (json.accounts || json.data || []);
}

async function getTransactions(accountId, accessToken) {
  const json = await userRequest(
    `/accounts/${encodeURIComponent(accountId)}/transactions?include_pending=true`,
    accessToken
  );
  return Array.isArray(json) ? json : (json.transactions || json.data || []);
}

async function getBalance(accountId, accessToken) {
  const json = await userRequest(`/accounts/${encodeURIComponent(accountId)}/balance`, accessToken);
  return json.balance || json;
}

module.exports = {
  manifest,
  isConfigured,
  getAuthorizationUrl,
  exchangeAuthorizationCode,
  refreshTokens,
  getAccounts,
  getTransactions,
  getBalance,
};
