const db = require('../db/connection-health');
const users = require('../db/users');
const basiq = require('./basiq');

const EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000;

function errorStatus(error) {
  const message = String(error?.message || error || '').toLowerCase();
  const userResourceForbidden = Number(error?.status) === 403
    && /^\/users\/[^/]+\/(accounts|transactions|connections)/.test(error?.path || '');
  if (userResourceForbidden
      || /consent|reauthor|revoked|connection (?:is )?invalid|consent.*expired/.test(message)) {
    return 'reauthorization_required';
  }
  return 'degraded';
}

function connectionExpiry(connection) {
  return connection.consentExpiresAt || connection.consent_expires_at
    || connection.expiryDate || connection.expireDate
    || connection.consent?.expiresAt || connection.profile?.expiryDate || null;
}

function summarizeConnections(connections, now = new Date()) {
  const rows = Array.isArray(connections) ? connections : [];
  const active = rows.filter((row) => String(row.status || '').toLowerCase() === 'active');
  const invalid = rows.filter((row) => String(row.status || '').toLowerCase() === 'invalid');
  const expiries = active.map(connectionExpiry).filter(Boolean)
    .map((value) => new Date(value)).filter((value) => Number.isFinite(value.getTime()));
  const earliest = expiries.sort((a, b) => a - b)[0] || null;
  let status = active.length ? 'healthy' : 'degraded';
  if ((earliest && earliest <= now) || (!active.length && invalid.length)) {
    status = 'reauthorization_required';
  } else if (invalid.length) status = 'degraded';
  else if (earliest && earliest.getTime() - now.getTime() <= EXPIRY_WARNING_MS) status = 'expiring';
  return {
    status,
    providerStatus: active.length ? 'active' : (invalid.length ? 'invalid' : 'missing'),
    consentExpiresAt: earliest?.toISOString() || null,
    replaceConsent: true,
    details: {
      connection_count: rows.length,
      connection_statuses: [...new Set(rows.map((row) => row.status).filter(Boolean))],
      affected_connections: invalid.map((row) => row.id).filter(Boolean),
    },
  };
}

async function recordImportSuccess(userId) {
  const current = await db.getHealth(userId);
  const expiry = current?.consent_expires_at ? new Date(current.consent_expires_at) : null;
  const status = expiry && expiry.getTime() - Date.now() <= EXPIRY_WARNING_MS
    ? (expiry <= new Date() ? 'reauthorization_required' : 'expiring')
    : 'healthy';
  const health = await db.upsertHealth(userId, 'basiq', {
    status, successAt: new Date(), consecutiveFailures: 0, lastError: null,
  });
  return health;
}

async function recordImportFailure(userId, error) {
  const current = await db.getHealth(userId);
  const health = await db.upsertHealth(userId, 'basiq', {
    status: errorStatus(error),
    failureAt: new Date(),
    consecutiveFailures: Number(current?.consecutive_failures || 0) + 1,
    lastError: String(error?.message || error || 'Connection check failed').slice(0, 1000),
  });
  return health;
}

async function checkBasiqConnection(userId) {
  const user = await users.findUserById(userId);
  if (!user?.basiq_user_id) throw new Error('No Basiq account linked');
  try {
    const summary = summarizeConnections(await basiq.getConnections(user.basiq_user_id));
    const health = await db.upsertHealth(userId, 'basiq', {
      ...summary,
      successAt: summary.status === 'healthy' ? new Date() : null,
      consecutiveFailures: 0,
    });
    return health;
  } catch (error) {
    await recordImportFailure(userId, error);
    throw error;
  }
}

async function scheduleNextCheck(
  userId,
  { now = new Date(), delayMs = 24 * 60 * 60 * 1000, excludeJobId = null } = {}
) {
  const runAt = new Date(now.getTime() + delayMs);
  return db.scheduleBasiqHealthCheck(userId, runAt, excludeJobId);
}

function shouldRecordProviderFailure(error) {
  return error?.provider === 'basiq';
}

async function basiqConnectionHealthJob(job) {
  let result;
  try {
    result = await checkBasiqConnection(job.payload.user_id);
  } catch (error) {
    result = await db.getHealth(job.payload.user_id);
  }
  await scheduleNextCheck(job.payload.user_id, { excludeJobId: job.id });
  return result;
}

async function seedConnectionHealthJobs(database = db, schedule = scheduleNextCheck) {
  const userIds = await database.listLinkedBasiqUserIds();
  return Promise.all(userIds.map((userId) => schedule(userId, { delayMs: 0 })));
}

function createConnectionHealthHandler(database) {
  return async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const health = await database.getHealth(req.session.userId);
      return res.json({
        connection_health: health || { provider: 'basiq', status: 'unknown' },
        reauthorise_url: health && ['expiring', 'reauthorization_required'].includes(health.status)
          ? '/basiq/reauthorise'
          : null,
      });
    } catch (error) {
      console.error('connection health lookup error:', error.message);
      return res.status(500).json({ error: 'Could not load connection health.' });
    }
  };
}

module.exports = {
  EXPIRY_WARNING_MS,
  errorStatus,
  summarizeConnections,
  recordImportSuccess,
  recordImportFailure,
  checkBasiqConnection,
  scheduleNextCheck,
  basiqConnectionHealthJob,
  seedConnectionHealthJobs,
  shouldRecordProviderFailure,
  connectionHealthHandler: createConnectionHealthHandler(db),
  createConnectionHealthHandler,
};
