'use strict';

// Migration: knowledge_chunks table for RAG knowledge base.
// With pgvector, enable embedding search. A plain Postgres install keeps the metadata table.
// text-embedding-3-small produces 1536-dimensional vectors.
// HNSW index: better recall than IVFFlat, can be built on empty table.

// The runner wraps each migration in a transaction. A failed CREATE EXTENSION
// must roll back to a savepoint before the remaining statements can run.
async function enableVector(client) {
  const { rows: [state] } = await client.query(
    "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed"
  );
  if (state.installed) return true;

  await client.query('SAVEPOINT enable_knowledge_vector');
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT enable_knowledge_vector');
    await client.query('RELEASE SAVEPOINT enable_knowledge_vector');
    // Missing extension files, unsupported extension, or insufficient privileges.
    if (!['58P01', '0A000', '42501'].includes(error.code)) throw error;
    console.warn('[migrate] pgvector unavailable. Creating knowledge_chunks without embeddings or a vector index.');
    return false;
  }
  await client.query('RELEASE SAVEPOINT enable_knowledge_vector');
  return true;
}

exports.up = async function up(client) {
  const hasVector = await enableVector(client);
  await client.query(`
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id            SERIAL PRIMARY KEY,
      article_slug  TEXT NOT NULL,
      article_title TEXT NOT NULL,
      chunk_index   INTEGER NOT NULL,
      content       TEXT NOT NULL,
      ${hasVector ? "embedding     vector(1536)," : ""}
      source        TEXT NOT NULL DEFAULT 'original',
      category      TEXT NOT NULL DEFAULT 'general',
      region        TEXT NOT NULL DEFAULT 'global',
      tags          TEXT[] DEFAULT '{}',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (article_slug, chunk_index)
    )
  `);

  // HNSW index for fast cosine similarity search
  if (hasVector) await client.query(`
    CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
    ON knowledge_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);

  // Metadata indices for filtered search
  await client.query(`CREATE INDEX IF NOT EXISTS knowledge_chunks_category_idx ON knowledge_chunks (category)`);
  await client.query(`CREATE INDEX IF NOT EXISTS knowledge_chunks_region_idx   ON knowledge_chunks (region)`);
  await client.query(`CREATE INDEX IF NOT EXISTS knowledge_chunks_source_idx   ON knowledge_chunks (source)`);
};
