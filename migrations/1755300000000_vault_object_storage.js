// migrations/1755300000000_vault_object_storage.js
// Move Vault file bytes out of Postgres and into S3-compatible object storage
// (Cloudflare R2 etc.) to stop every upload/download counting against Neon's
// network-transfer allowance.
//
// Additive and backwards-compatible:
//   - storage_key: the object key when the bytes live in object storage; NULL
//     for legacy rows whose bytes are still in `content`.
//   - content is made NULLable so new object-storage rows don't need a bytea.
//     Existing rows keep their bytes, so nothing is migrated or lost — Vault
//     reads whichever of the two is populated (see db/vault.js).
//
// This only touches the vault_files table, which the migration guard does not
// treat as protected, so no [reviewed] tag is required.
module.exports = {
  name: 'vault_object_storage',
  up: async (client) => {
    await client.query(`
      ALTER TABLE vault_files ADD COLUMN IF NOT EXISTS storage_key TEXT;
      ALTER TABLE vault_files ALTER COLUMN content DROP NOT NULL;
    `);
  }
};
