'use strict';

const crypto = require('crypto');
const express = require('express');
const lunchflow = require('../services/lunchflow');
const connections = require('../db/provider-connections');
const users = require('../db/users');
const providerTokenCrypto = require('../services/provider-token-crypto');
const importRuns = require('../db/import-runs');
const connectionHealth = require('../db/connection-health');

function callbackUri() {
  if ((process.env.LUNCHFLOW_REDIRECT_URI || '').trim()) {
    return process.env.LUNCHFLOW_REDIRECT_URI.trim();
  }
  let baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  if (baseUrl === 'https://hellomaal.com') baseUrl = 'https://www.hellomaal.com';
  return `${baseUrl}/lunchflow/callback`;
}

function stateMatches(expected, received) {
  if (!expected || !received) return false;
  const left = Buffer.from(String(expected));
  const right = Buffer.from(String(received));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createHandlers(dependencies = {}) {
  const provider = dependencies.provider || lunchflow;
  const connectionStore = dependencies.connectionStore || connections;
  const userStore = dependencies.userStore || users;
  const imports = dependencies.importRuns || importRuns;
  const healthStore = dependencies.healthStore || connectionHealth;
  const tokenProtection = dependencies.tokenProtection || providerTokenCrypto;
  return {
    connect: async (req, res) => {
    if (!provider.isConfigured() || !tokenProtection.isConfigured()) {
      return res.redirect('/app/assets?lunchflow=not_configured');
    }
    try {
      const user = await userStore.findUserById(req.session.userId);
      const state = crypto.randomBytes(32).toString('base64url');
      req.session.lunchflowOAuthState = state;
      const url = provider.getAuthorizationUrl({
        redirectUri: callbackUri(),
        email: user.email,
        state,
      });
      return res.redirect(url);
    } catch (error) {
      console.error('Lunch Flow connect error:', error.message);
      return res.redirect('/app/assets?lunchflow=error');
    }
    },

    callback: async (req, res) => {
    const expectedState = req.session.lunchflowOAuthState;
    delete req.session.lunchflowOAuthState;
    if (!stateMatches(expectedState, req.query.state)) {
      return res.redirect('/app/assets?lunchflow=invalid_state');
    }
    if (!req.query.code) return res.redirect('/app/assets?lunchflow=missing_code');
    try {
      const tokens = await provider.exchangeAuthorizationCode({
        code: String(req.query.code),
        redirectUri: callbackUri(),
      });
      await connectionStore.upsertConnection(req.session.userId, 'lunchflow', tokens);
      await connectionStore.recordEvent?.(req.session.userId, 'lunchflow', 'connected', { scopes: tokens.scope || null });
      return res.redirect('/app/assets?lunchflow=connected');
    } catch (error) {
      console.error('Lunch Flow callback error:', error.message);
      return res.redirect('/app/assets?lunchflow=error');
    }
    },
    status: async (req, res) => {
      try {
        const connection = connectionStore.getConnectionMetadata
          ? await connectionStore.getConnectionMetadata(req.session.userId, 'lunchflow')
          : await connectionStore.getConnection(req.session.userId, 'lunchflow');
        const health = await healthStore.getHealth?.(req.session.userId, 'lunchflow');
        return res.json({
          live: provider.isConfigured() && tokenProtection.isConfigured(),
          connected: !!connection,
          scopes: connection?.scopes ? String(connection.scopes).split(/[ ,]+/).filter(Boolean) : [],
          scopes_confirmed: !!connection?.scopes,
          health: health || { provider: 'lunchflow', status: connection ? 'unknown' : 'reauthorization_required' },
        });
      } catch (error) {
        console.error('Lunch Flow status error:', error.message);
        return res.status(500).json({ error: 'Could not load Lunch Flow status.' });
      }
    },
    sync: async (req, res) => {
      try {
        const lookupConnection = connectionStore.getConnectionMetadata || connectionStore.getConnection;
        if (lookupConnection && !await lookupConnection(req.session.userId, 'lunchflow')) {
          return res.status(409).json({ error: 'Connect Lunch Flow before syncing.' });
        }
        const requestKey = String(req.get?.('Idempotency-Key') || crypto.randomUUID()).slice(0, 200);
        const { run, job } = await imports.enqueueImportRun(req.session.userId, {
          provider: 'lunchflow', requestKey, jobType: 'lunchflow_import',
        });
        await connectionStore.recordEvent?.(req.session.userId, 'lunchflow', 'sync_started', { importRunId: run.id });
        return res.status(202).json({ ok: true, import_run_id: run.id, job_id: job.id, status: run.status });
      } catch (error) {
        console.error('Lunch Flow sync error:', error.message);
        const status = /No Lunch Flow provider connection/.test(error.message) ? 409 : 502;
        return res.status(status).json({
          error: status === 409
            ? 'Connect Lunch Flow before syncing.'
            : 'Lunch Flow sync failed. Please try again.',
        });
      }
    },
    disconnect: async (req, res) => {
      try {
        const connection = await connectionStore.getConnection(req.session.userId, 'lunchflow');
        let remoteRevokeFailed = false;
        try { await provider.revokeAccess?.(connection?.access_token); }
        catch (error) { remoteRevokeFailed = true; console.error('Lunch Flow remote revoke failed:', error.message); }
        await connectionStore.deleteConnection(req.session.userId, 'lunchflow');
        await connectionStore.recordEvent?.(req.session.userId, 'lunchflow', 'revoked', {
          scopes: connection?.scopes, details: { remote_revoke_failed: remoteRevokeFailed },
        });
        await healthStore.upsertHealth?.(req.session.userId, 'lunchflow', {
          status: 'reauthorization_required', consecutiveFailures: 0, lastError: null,
          details: { revoked_by_user: true },
        });
        return res.json({ ok: true, connected: false, remote_revoke_failed: remoteRevokeFailed });
      } catch (error) {
        console.error('Lunch Flow disconnect error:', error.message);
        return res.status(500).json({ error: 'Could not disconnect Lunch Flow.' });
      }
    },
  };
}

function createRouter(dependencies = {}) {
  const router = express.Router();
  const handlers = createHandlers(dependencies);
  router.use((req, res, next) => {
    if (!req.session.userId) return res.redirect('/login');
    next();
  });
  router.get('/connect', handlers.connect);
  router.get('/callback', handlers.callback);
  router.get('/status', handlers.status);
  router.post('/sync', handlers.sync);
  router.post('/disconnect', handlers.disconnect);

  return router;
}

module.exports = createRouter();
module.exports.createRouter = createRouter;
module.exports.createHandlers = createHandlers;
module.exports.stateMatches = stateMatches;
