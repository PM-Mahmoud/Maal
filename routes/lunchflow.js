'use strict';

const crypto = require('crypto');
const express = require('express');
const lunchflow = require('../services/lunchflow');
const connections = require('../db/provider-connections');
const users = require('../db/users');
const { syncLunchFlow } = require('../services/lunchflow-sync');
const providerTokenCrypto = require('../services/provider-token-crypto');

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
  const sync = dependencies.sync || syncLunchFlow;
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
      return res.redirect('/app/assets?lunchflow=connected');
    } catch (error) {
      console.error('Lunch Flow callback error:', error.message);
      return res.redirect('/app/assets?lunchflow=error');
    }
    },
    status: async (req, res) => {
      try {
        const connection = await connectionStore.getConnection(req.session.userId, 'lunchflow');
        return res.json({
          live: provider.isConfigured() && tokenProtection.isConfigured(),
          connected: !!connection,
        });
      } catch (error) {
        console.error('Lunch Flow status error:', error.message);
        return res.status(500).json({ error: 'Could not load Lunch Flow status.' });
      }
    },
    sync: async (req, res) => {
      try {
        const result = await sync(req.session.userId);
        return res.json({ ok: true, ...result });
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

  return router;
}

module.exports = createRouter();
module.exports.createRouter = createRouter;
module.exports.createHandlers = createHandlers;
module.exports.stateMatches = stateMatches;
