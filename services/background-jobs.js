const database = require('../db/background-jobs');

function createListJobsHandler(db) {
  return async function listJobs(req, res) {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const jobs = await db.listJobsForUser(req.session.userId, req.query.limit);
      return res.json({ jobs });
    } catch (error) {
      console.error('/api/v1/background-jobs error:', error.message);
      return res.status(500).json({ error: 'Could not load background jobs.' });
    }
  };
}

module.exports = {
  createListJobsHandler,
  listJobsHandler: createListJobsHandler(database),
};
