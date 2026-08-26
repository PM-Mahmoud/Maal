'use strict';

// Build 8 hardening is additive. The original collaboration_extensibility
// migration created the shared tables alongside Build 9's tables; this
// migration only adds Build 8 indexes and the document-link integrity guard.
module.exports = {
  name: 'build8_collaboration',
  up: async (client) => {
    await client.query(`
      CREATE INDEX IF NOT EXISTS household_members_user_idx
        ON household_members(user_id, household_id);
      CREATE INDEX IF NOT EXISTS access_grants_grantee_status_idx
        ON access_grants(grantee_user_id, status, expires_at);
      CREATE INDEX IF NOT EXISTS supporting_documents_user_tax_year_idx
        ON supporting_documents(user_id, tax_year, created_at DESC);

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conname = 'supporting_documents_vault_file_fk'
        ) THEN
          -- NOT VALID preserves any legacy orphan links while enforcing the
          -- invariant for every new or updated supporting-document link.
          ALTER TABLE supporting_documents
            ADD CONSTRAINT supporting_documents_vault_file_fk
            FOREIGN KEY (vault_file_id) REFERENCES vault_files(id)
            ON DELETE CASCADE NOT VALID;
        END IF;
      END $$;
    `);
  },
};
