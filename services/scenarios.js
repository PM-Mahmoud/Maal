const defaultDatabase = require('../db/scenarios');
const { modelScenario } = require('../lib/scenarios');

function createScenarioService(database = defaultDatabase, today = () => new Date().toISOString().slice(0, 10)) {
  return {
    async preview(userId, input = {}) {
      const baseline = await database.loadScenarioBaseline(userId, today());
      return { baseline, result: modelScenario(baseline, input.assumptions || {}) };
    },
    async create(userId, input = {}) {
      const name = String(input.name || 'Untitled scenario').trim().slice(0, 120);
      if (!name) throw Object.assign(new Error('Scenario name is required'), { status: 400 });
      const baseline = await database.loadScenarioBaseline(userId, today());
      const result = modelScenario(baseline, input.assumptions || {});
      return database.saveScenario(userId, { name, baseline, assumptions: result.assumptions, result });
    },
    list: (userId) => database.listScenarios(userId),
    get: (userId, id) => database.getScenario(userId, id),
  };
}

const service = createScenarioService();
function authenticated(req, res) { if (!req.session.userId) { res.status(401).json({ error: 'Not authenticated' }); return false; } return true; }
async function previewHandler(req, res) { if (!authenticated(req, res)) return; try { res.json(await service.preview(req.session.userId, req.body)); } catch (error) { if (!error.status) console.error('/api/v1/scenarios/preview:', error.message); res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not model scenario.' }); } }
async function createHandler(req, res) { if (!authenticated(req, res)) return; try { res.status(201).json(await service.create(req.session.userId, req.body)); } catch (error) { if (!error.status) console.error('/api/v1/scenarios:', error.message); res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not save scenario.' }); } }
async function listHandler(req, res) { if (!authenticated(req, res)) return; try { res.json(await service.list(req.session.userId)); } catch (error) { console.error('/api/v1/scenarios:', error.message); res.status(500).json({ error: 'Could not load scenarios.' }); } }
async function getHandler(req, res) { if (!authenticated(req, res)) return; try { const row = await service.get(req.session.userId, req.params.id); if (!row) return res.status(404).json({ error: 'Scenario not found.' }); res.json(row); } catch (error) { console.error('/api/v1/scenarios/:id:', error.message); res.status(500).json({ error: 'Could not load scenario.' }); } }

module.exports = { createScenarioService, previewHandler, createHandler, listHandler, getHandler };
