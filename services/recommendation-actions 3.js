const defaultDatabase = require('../db/recommendation-actions');
const { actionsFromHealthRules } = require('../lib/recommendation-actions');

async function defaultHealthProvider(userId) {
  const profiles = require('../db/profiles');
  const assets = require('../db/assets');
  const profile = (await profiles.getProfileByUserId(userId)) || {};
  const effective = assets.mergeAssetSummaryIntoProfile(profile, await assets.getAssetSummary(userId));
  return require('../lib/maal-score').computeMaalScore(effective);
}
const TRANSITIONS = { pending: new Set(['in_progress', 'completed', 'dismissed']), in_progress: new Set(['pending', 'completed', 'dismissed']), dismissed: new Set(['pending']), completed: new Set() };

function createRecommendationActionService(database = defaultDatabase, healthProvider = defaultHealthProvider, now = () => new Date()) {
  async function currentOutcome(recommendation, health) {
    const key = String(recommendation.source_key || '').replace(/^health:/, '');
    const rule = (health.rules || []).find((item) => item.key === key);
    if (!rule || rule.observed?.value == null) return null;
    const value = Number(rule.observed.value), baseline = Number(recommendation.baseline?.value);
    const target = recommendation.target || rule.target || null;
    const rawChange = Number.isFinite(baseline) ? value - baseline : null;
    const improvement = rawChange == null ? null : target?.operator === '<=' ? -rawChange : rawChange;
    const targetMet = target ? (target.operator === '<=' ? value <= Number(target.value) : value >= Number(target.value)) : null;
    return { metric: key, value, unit: rule.observed.unit || recommendation.baseline?.unit || null, baseline_value: Number.isFinite(baseline) ? baseline : null, delta: improvement == null ? null : Math.round(improvement * 100) / 100, target, target_met: targetMet, outcome_status: targetMet === null ? 'measured' : targetMet ? 'target_met' : 'progressing', measured_at: now(), note: 'Delta records improvement from baseline; positive is progress toward the target.' };
  }
  return {
    async refresh(userId) { const health = await healthProvider(userId); await database.syncRecommendations(userId, actionsFromHealthRules(health.rules), health.rules || [], now()); return database.listRecommendations(userId); },
    list: (userId) => database.listRecommendations(userId),
    async transition(userId, id, toStatus) {
      const recommendation = await database.getRecommendation(userId, id);
      if (!recommendation) throw Object.assign(new Error('Recommendation not found.'), { status: 404 });
      if (!TRANSITIONS[recommendation.status]?.has(toStatus)) throw Object.assign(new Error(`Cannot move recommendation from ${recommendation.status} to ${toStatus}.`), { status: 400 });
      const occurredAt = now();
      const outcome = toStatus === 'completed' ? await currentOutcome(recommendation, await healthProvider(userId)) : null;
      if (toStatus === 'completed' && !outcome) throw Object.assign(new Error('This action cannot be completed until its outcome can be measured.'), { status: 400 });
      return database.recordTransition(userId, id, { from_status: recommendation.status, to_status: toStatus, occurred_at: occurredAt }, outcome);
    },
    async checkIn(userId, id, note) {
      const recommendation = await database.getRecommendation(userId, id);
      if (!recommendation) throw Object.assign(new Error('Recommendation not found.'), { status: 404 });
      const outcome = await currentOutcome(recommendation, await healthProvider(userId));
      if (!outcome) throw Object.assign(new Error('This outcome cannot be measured until the required data is available.'), { status: 400 });
      return database.addOutcome(userId, id, { ...outcome, note: String(note || outcome.note).slice(0, 500) });
    },
  };
}

const service = createRecommendationActionService();
function auth(req, res) { if (!req.session.userId) { res.status(401).json({ error: 'Not authenticated' }); return false; } return true; }
function failure(res, error, fallback) { res.status(error.status || 500).json({ error: error.status ? error.message : fallback }); }
async function listHandler(req, res) { if (!auth(req, res)) return; try { res.json(await service.list(req.session.userId)); } catch (error) { console.error('/api/v1/recommendation-actions:', error.message); failure(res, error, 'Could not load actions.'); } }
async function refreshHandler(req, res) { if (!auth(req, res)) return; try { res.json(await service.refresh(req.session.userId)); } catch (error) { console.error('/api/v1/recommendation-actions/refresh:', error.message); failure(res, error, 'Could not refresh actions.'); } }
async function statusHandler(req, res) { if (!auth(req, res)) return; try { res.json(await service.transition(req.session.userId, req.params.id, req.body?.status)); } catch (error) { failure(res, error, 'Could not update action.'); } }
async function outcomeHandler(req, res) { if (!auth(req, res)) return; try { res.status(201).json(await service.checkIn(req.session.userId, req.params.id, req.body?.note)); } catch (error) { failure(res, error, 'Could not measure outcome.'); } }
module.exports = { createRecommendationActionService, listHandler, refreshHandler, statusHandler, outcomeHandler };
