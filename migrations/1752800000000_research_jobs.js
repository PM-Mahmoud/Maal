// PR 8 — Deep research pipeline: async job tracking.
//
// Additive-only: a NEW per-user table that FK-references the protected `users`
// table (FK on a new table is safe per the migration guard) and never touches
// users/transactions/session/linked_accounts. The existing `research_reports`
// table is unchanged — a finished job's rendered report still lands there; this
// table tracks the async pipeline run (phase + status) the client polls.
module.exports = {
  name: 'research_jobs',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS research_jobs (
        id          BIGSERIAL PRIMARY KEY,
        user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question    TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running','complete','error')),
        phase       TEXT NOT NULL DEFAULT 'plan'
                      CHECK (phase IN ('plan','gather','compute','write','verify','render','done')),
        report_id   BIGINT REFERENCES research_reports(id) ON DELETE SET NULL,
        result      JSONB,
        error       TEXT,
        started_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_research_jobs_user ON research_jobs(user_id, started_at DESC);
    `);
  },
};
