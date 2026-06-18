'use strict';

// services/embeddings.js
// Azure OpenAI text-embedding-3-small adapter.
// Used by lib/rag.js (query embedding) and scripts/ingest-knowledge.js (bulk ingestion).
//
// Env: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_EMBEDDING_DEPLOYMENT
// Dimensions: 1536 (text-embedding-3-small default)

function embeddingConfig() {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
  const apiKey   = (process.env.AZURE_OPENAI_API_KEY || '').trim();
  const deployment = (process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-3-small').trim();
  if (!endpoint || !apiKey) return null;

  const useV1 = endpoint.includes('services.ai.azure.com') || endpoint.endsWith('/openai/v1');
  const v1Base = endpoint.endsWith('/openai/v1') ? endpoint : `${endpoint.replace(/\/openai$/, '')}/openai/v1`;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';
  const url = useV1
    ? `${v1Base}/embeddings`
    : `${endpoint}/openai/deployments/${deployment}/embeddings?api-version=${apiVersion}`;

  return { url, apiKey, deployment, useV1 };
}

function hasEmbeddings() {
  return !!embeddingConfig();
}

// Embed a single string. Returns Float32Array of 1536 dimensions.
async function embedText(text) {
  const cfg = embeddingConfig();
  if (!cfg) throw new Error('Embedding not configured: set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_EMBEDDING_DEPLOYMENT');

  const body = { input: String(text).slice(0, 8191) }; // API limit
  if (cfg.useV1) body.model = cfg.deployment;

  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': cfg.apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Embedding API ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.data[0].embedding; // array of numbers
}

// Embed a batch of strings. Returns array of embedding arrays.
// Batches into groups of 16 to stay within API limits.
async function embedBatch(texts, { batchSize = 16, onProgress } = {}) {
  const results = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const cfg = embeddingConfig();
    if (!cfg) throw new Error('Embedding not configured');

    const body = { input: batch.map(t => String(t).slice(0, 8191)) };
    if (cfg.useV1) body.model = cfg.deployment;

    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': cfg.apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Embedding batch API ${res.status}: ${detail.slice(0, 200)}`);
    }
    const json = await res.json();
    // API returns data sorted by index
    const sorted = json.data.sort((a, b) => a.index - b.index);
    for (const item of sorted) results.push(item.embedding);

    if (onProgress) onProgress(Math.min(i + batchSize, texts.length), texts.length);

    // Brief pause between batches to avoid rate limits
    if (i + batchSize < texts.length) await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

module.exports = { hasEmbeddings, embedText, embedBatch };
