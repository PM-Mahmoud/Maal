module.exports = {
  name: 'collaboration_extensibility',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS households (
        id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS household_members (
        household_id BIGINT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('owner','member')), ownership NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (ownership >= 0 AND ownership <= 100),
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (household_id,user_id)
      );
      CREATE TABLE IF NOT EXISTS access_grants (
        id BIGSERIAL PRIMARY KEY, owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        grantee_email TEXT NOT NULL, grantee_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        role TEXT NOT NULL CHECK (role IN ('accountant','adviser')), scopes TEXT[] NOT NULL DEFAULT ARRAY['overview'],
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','revoked')), expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revoked_at TIMESTAMPTZ,
        UNIQUE (owner_user_id, grantee_email, role)
      );
      CREATE TABLE IF NOT EXISTS supporting_documents (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        vault_file_id BIGINT, tax_year INTEGER, document_type TEXT NOT NULL, entity_type TEXT, entity_id BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, data JSONB NOT NULL DEFAULT '{}'::jsonb,
        read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS activity_ledger (
        id BIGSERIAL PRIMARY KEY, actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        subject_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL, resource_type TEXT,
        resource_id TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, ip_address INET, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS api_tokens (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, scopes TEXT[] NOT NULL DEFAULT ARRAY['read'],
        last_used_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS webhooks (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        url TEXT NOT NULL, secret_encrypted TEXT NOT NULL, events TEXT[] NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS automation_rules (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL, event_type TEXT NOT NULL, condition_path TEXT NOT NULL,
        condition JSONB NOT NULL DEFAULT '{}'::jsonb, action_type TEXT NOT NULL,
        action JSONB NOT NULL DEFAULT '{}'::jsonb, active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS automation_rules_user_event ON automation_rules(user_id,event_type,active);
      CREATE INDEX IF NOT EXISTS notifications_user_unread ON notifications(user_id, read_at, created_at DESC);
      CREATE INDEX IF NOT EXISTS activity_subject_created ON activity_ledger(subject_user_id, created_at DESC);
    `);
  }
};
