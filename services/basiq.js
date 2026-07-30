// services/basiq.js
// Basiq (Consumer Data Right open banking) integration — sandbox-ready.
//
// HOW TO SET UP THE SANDBOX (one-time, ~5 minutes):
//   1. Sign up free at https://dashboard.basiq.io
//   2. Create an application (choose the free Sandbox/Development tier)
//   3. Copy the API key from the app's "API Keys" page
//   4. On Render: Environment → add BASIQ_API_KEY = <that key>
//   5. Redeploy. The bank tiles on /dashboard/transactions now launch the real
//      Basiq consent UI. In sandbox, search for "Hooli Bank" (Basiq's test
//      bank) and log in with the test credentials shown on screen
//      (user: gavinBelson / password: hooli2016 at time of writing).
//
// Uses Basiq API v3. All calls are plain HTTPS via fetch (Node 18+).

const BASIQ_BASE = 'https://au-api.basiq.io';

function apiKey() {
  // trim() guards against stray spaces/newlines pasted into Render's env editor
  return (process.env.BASIQ_API_KEY || '').trim();
}

function hasBasiq() {
  return !!apiKey();
}

let cachedServerToken = null;
let cachedServerTokenExp = 0;

async function basiqFetch(path, options = {}, token) {
  let res;
  try {
    res = await fetch(BASIQ_BASE + path, {
      ...options,
      headers: {
        'Authorization': token,
        'Accept': 'application/json',
        'Content-Type': options.body && typeof options.body === 'string' && options.body[0] === '{'
          ? 'application/json'
          : 'application/x-www-form-urlencoded',
        'basiq-version': '3.0',
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    error.provider = 'basiq';
    error.path = path;
    throw error;
  }
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch (e) { /* empty body */ }
  if (!res.ok) {
    const detail = json && json.data && json.data[0] && json.data[0].detail;
    const error = new Error(`Basiq ${res.status} on ${path}: ${detail || text.slice(0, 200)}`);
    error.status = res.status;
    error.provider = 'basiq';
    error.path = path;
    error.providerCode = json && json.data && json.data[0] && json.data[0].code;
    throw error;
  }
  return json;
}

// SERVER_ACCESS token — for server-to-server calls. Cached ~50 min (TTL 60).
async function getServerToken() {
  if (cachedServerToken && Date.now() < cachedServerTokenExp) return cachedServerToken;
  const json = await basiqFetch('/token', {
    method: 'POST',
    body: 'scope=SERVER_ACCESS',
  }, `Basic ${apiKey()}`);
  cachedServerToken = `Bearer ${json.access_token}`;
  cachedServerTokenExp = Date.now() + 50 * 60 * 1000;
  return cachedServerToken;
}

// CLIENT_ACCESS token — short-lived, bound to one user, powers the consent UI.
async function getClientToken(basiqUserId) {
  const json = await basiqFetch('/token', {
    method: 'POST',
    body: `scope=CLIENT_ACCESS&userId=${encodeURIComponent(basiqUserId)}`,
  }, `Basic ${apiKey()}`);
  return json.access_token;
}

async function createBasiqUser(email) {
  const token = await getServerToken();
  const json = await basiqFetch('/users', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }, token);
  return json.id;
}

// Hosted consent UI URL — user picks their bank and approves read-only access.
async function getConsentUrl(basiqUserId, action = 'connect') {
  const clientToken = await getClientToken(basiqUserId);
  return `https://consent.basiq.io/home?token=${clientToken}&action=${encodeURIComponent(action)}`;
}

async function getAccounts(basiqUserId) {
  const token = await getServerToken();
  const json = await basiqFetch(`/users/${basiqUserId}/accounts`, { method: 'GET' }, token);
  return json.data || [];
}

async function getTransactions(basiqUserId, limit = 25) {
  const token = await getServerToken();
  const json = await basiqFetch(`/users/${basiqUserId}/transactions?limit=${limit}`, { method: 'GET' }, token);
  return json.data || [];
}

async function getConnections(basiqUserId) {
  const token = await getServerToken();
  const json = await basiqFetch(
    `/users/${basiqUserId}/connections`, { method: 'GET' }, token
  );
  return json.data || [];
}

module.exports = {
  hasBasiq, createBasiqUser, getConsentUrl,
  getAccounts, getTransactions, getConnections,
};
