'use strict';

exports.up = async function up(client) {
  const { rows: [state] } = await client.query(`
    SELECT
      EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed,
      EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'knowledge_chunks'::regclass
          AND attname = 'embedding' AND NOT attisdropped
      ) AS has_column,
      to_regclass('knowledge_chunks_embedding_idx') IS NOT NULL AS has_index
  `);

  if (!state.installed) {
    console.warn('[migrate] pgvector unavailable. Skipping knowledge embedding restoration.');
    return;
  }

  if (!state.has_column) {
    await client.query('ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536)');
  }

  if (!state.has_index) {
    await client.query(`
      CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
        ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    `);
  }
};
