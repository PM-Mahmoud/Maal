'use strict';

module.exports = {
  name: 'household_ownership',
  up: async (client) => {
    await client.query(`
      ALTER TABLE ownership_interests
        ADD COLUMN IF NOT EXISTS household_id BIGINT REFERENCES households(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;

      CREATE INDEX IF NOT EXISTS ownership_interests_household_subject_idx
        ON ownership_interests(household_id, subject_type, subject_key)
        WHERE household_id IS NOT NULL;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'ownership_household_member_fk'
        ) THEN
          ALTER TABLE ownership_interests
            ADD CONSTRAINT ownership_household_member_fk
            FOREIGN KEY (household_id, owner_user_id)
            REFERENCES household_members(household_id, user_id)
            ON DELETE CASCADE NOT VALID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'ownership_household_pair_check'
        ) THEN
          ALTER TABLE ownership_interests
            ADD CONSTRAINT ownership_household_pair_check CHECK (
              (household_id IS NULL AND owner_user_id IS NULL) OR
              (household_id IS NOT NULL AND owner_user_id IS NOT NULL)
            ) NOT VALID;
        END IF;
      END $$;
    `);
  },
};
