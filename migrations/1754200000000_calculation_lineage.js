module.exports = {
  name: 'calculation_lineage',
  up: async (client) => {
    await client.query(`
      ALTER TABLE calculation_audits
        ADD COLUMN IF NOT EXISTS calculation_key TEXT;
      UPDATE calculation_audits
         SET calculation_key = 'legacy:' || id::text
       WHERE calculation_key IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_calculation_audits_idempotency
        ON calculation_audits(user_id, calculation_type, calculation_version, calculation_key);

      CREATE OR REPLACE FUNCTION protect_calculation_audit()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'UPDATE' THEN
          RAISE EXCEPTION 'calculation audits are immutable';
        END IF;
        IF TG_OP = 'DELETE'
           AND EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id) THEN
          RAISE EXCEPTION 'calculation audits may only be deleted with their user';
        END IF;
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS calculation_audits_immutable ON calculation_audits;
      CREATE TRIGGER calculation_audits_immutable
        BEFORE UPDATE OR DELETE ON calculation_audits
        FOR EACH ROW EXECUTE FUNCTION protect_calculation_audit();
    `);
  },
};
