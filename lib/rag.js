'use strict';

// lib/rag.js
// TODO: verify unused — this module is not imported by any route or service currently.
// It was scaffolded for RAG-powered advisor grounding but the feature is not yet wired up.
// Retrieval-Augmented Generation — semantic search over the knowledge_chunks table.
// Called by the ask/research/radar routes to inject relevant knowledge into prompts.
//
// retrieve(query, opts) → array of chunk objects for prompt injection
// buildKnowledgeSection(chunks) → formatted string ready to append to a system prompt

const { embedText, hasEmbeddings } = require('../services/embeddings');
const db = require('../db/auth').pool;

// Retrieve the most semantically relevant knowledge chunks for a query.
// @param {string} query — the user's question or a summary of the request
// @param {object} opts
// @param {number} [opts.topK=5]       — number of chunks to return
// @param {number} [opts.minScore=0.3] — minimum cosine similarity (0–1)
// @param {string} [opts.category]     — filter to a specific category
// @param {string} [opts.region]       — filter to a specific region ('au', 'global', 'us', etc.)
// @returns {Promise<Array<{id, article_title, article_slug, content, category, region, score}>>}
async function retrieve(query, { topK = 5, minScore = 0.30, category = null, region = null } = {}) {
  if (!hasEmbeddings()) return [];
  if (!query || !query.trim()) return [];

  let embedding;
  try {
    embedding = await embedText(query.trim().slice(0, 1000));
  } catch (e) {
    console.error('[rag] embed error:', e.message);
    return [];
  }

  const vectorLiteral = '[' + embedding.join(',') + ']';

  // Build WHERE clause for optional filters
  const conditions = [`1 - (embedding <=> $1::vector) >= $2`];
  const params = [vectorLiteral, minScore];
  if (category) { conditions.push(`category = $${params.length + 1}`); params.push(category); }
  if (region)   { conditions.push(`region = $${params.length + 1}`);   params.push(region); }

  const sql = `
    SELECT
      id,
      article_title,
      article_slug,
      content,
      category,
      region,
      1 - (embedding <=> $1::vector) AS score
    FROM knowledge_chunks
    WHERE ${conditions.join(' AND ')}
    ORDER BY embedding <=> $1::vector
    LIMIT $${params.length + 1}
  `;
  params.push(topK);

  try {
    const { rows } = await db.query(sql, params);
    return rows;
  } catch (e) {
    console.error('[rag] query error:', e.message);
    return [];
  }
}

// Format retrieved chunks into a prompt-ready string.
// Deduplicates by article — if multiple chunks from same article, groups them.
function buildKnowledgeSection(chunks) {
  if (!chunks || !chunks.length) return '';

  // Group by article
  const byArticle = new Map();
  for (const chunk of chunks) {
    const key = chunk.article_slug;
    if (!byArticle.has(key)) {
      byArticle.set(key, { title: chunk.article_title, excerpts: [] });
    }
    byArticle.get(key).excerpts.push(chunk.content);
  }

  const parts = [];
  for (const [, article] of byArticle) {
    parts.push(`### ${article.title}\n${article.excerpts.join('\n\n')}`);
  }

  return (
    '\n\n--- KNOWLEDGE BASE (use these facts to ground your answer) ---\n' +
    'The following excerpts are from Maal\'s verified knowledge base. ' +
    'Prefer these over your training data when answering. Cite the article title if you draw a specific fact from it.\n\n' +
    parts.join('\n\n') +
    '\n--- END KNOWLEDGE BASE ---'
  );
}

// Convenience: retrieve then format in one call.
async function retrieveAndFormat(query, opts) {
  const chunks = await retrieve(query, opts);
  return { chunks, section: buildKnowledgeSection(chunks) };
}

module.exports = { retrieve, buildKnowledgeSection, retrieveAndFormat };
