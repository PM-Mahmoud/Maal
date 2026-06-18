'use strict';

// Migration: knowledge_chunks table for RAG knowledge base.
// Requires pgvector extension (CREATE EXTENSION vector) — already enabled on Neon.
// text-embedding-3-small produces 1536-dimensional vectors.
// HNSW index: better recall than IVFFlat, can be built on empty table.

module.exports = async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id            SERIAL PRIMARY KEY,
      article_slug  TEXT NOT NULL,
      article_title TEXT NOT NULL,
      chunk_index   INTEGER NOT NULL,
      content       TEXT NOT NULL,
      embedding     vector(1536),
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
  await client.query(`
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
