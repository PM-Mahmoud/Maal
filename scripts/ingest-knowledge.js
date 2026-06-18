'use strict';

// scripts/ingest-knowledge.js
// Reads all markdown articles from content/knowledge/, chunks them, embeds each
// chunk via Azure OpenAI text-embedding-3-small, and upserts into knowledge_chunks.
//
// Run after pushing to production (DATABASE_URL and Azure env vars must be set):
//   node scripts/ingest-knowledge.js
//
// Safe to re-run: uses INSERT ... ON CONFLICT (article_slug, chunk_index) DO UPDATE.
// Add --dry-run to preview chunks without writing to DB.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { embedBatch } = require('../services/embeddings');

const DRY_RUN = process.argv.includes('--dry-run');
const CHUNK_SIZE = 1400;   // chars per chunk
const CHUNK_OVERLAP = 200; // chars overlap between chunks

// Parse YAML-like frontmatter from markdown files
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (!key || !rest.length) continue;
    const val = rest.join(':').trim().replace(/^['"]|['"]$/g, '');
    if (val.startsWith('[')) {
      meta[key.trim()] = val.slice(1, -1).split(',').map(t => t.trim().replace(/^['"]|['"]$/g, ''));
    } else {
      meta[key.trim()] = val;
    }
  }
  return { meta, body: match[2].trim() };
}

// Split text into overlapping chunks
function chunkText(text, size, overlap) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start += size - overlap;
  }
  return chunks.filter(c => c.length > 100); // skip tiny trailing chunks
}

// Walk a directory recursively, return all .md file paths
function walkMd(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkMd(full));
    else if (entry.name.endsWith('.md')) results.push(full);
  }
  return results;
}

async function main() {
  const knowledgeDir = path.join(__dirname, '..', 'content', 'knowledge');
  const files = walkMd(knowledgeDir);
  console.log(`Found ${files.length} knowledge articles`);

  // Parse all articles into chunk records
  const records = [];
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    const slug = path.relative(knowledgeDir, file).replace(/\.md$/, '').replace(/\\/g, '/');
    const title = meta.title || slug;
    const category = meta.category || 'general';
    const region = meta.region || 'global';
    const source = meta.source || 'original';
    const tags = Array.isArray(meta.tags) ? meta.tags : [];

    const chunks = chunkText(body, CHUNK_SIZE, CHUNK_OVERLAP);
    for (let i = 0; i < chunks.length; i++) {
      records.push({ slug, title, chunkIndex: i, content: chunks[i], category, region, source, tags });
    }
  }

  console.log(`Total chunks to embed: ${records.length}`);

  if (DRY_RUN) {
    console.log('\n-- DRY RUN: first 3 chunks --');
    for (const r of records.slice(0, 3)) {
      console.log(`\n[${r.slug}] chunk ${r.chunkIndex} (${r.content.length} chars):`);
      console.log(r.content.slice(0, 200) + '...');
    }
    return;
  }

  // Embed all chunks in batches
  const texts = records.map(r => r.content);
  console.log('\nEmbedding chunks via Azure OpenAI...');
  const embeddings = await embedBatch(texts, {
    batchSize: 16,
    onProgress: (done, total) => {
      if (done % 16 === 0 || done === total) {
        process.stdout.write(`\r  ${done}/${total} chunks embedded`);
      }
    },
  });
  console.log('\nEmbedding complete.');

  // Upsert into database
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  console.log('Upserting into knowledge_chunks...');
  let upserted = 0;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const embedding = '[' + embeddings[i].join(',') + ']';
    await db.query(`
      INSERT INTO knowledge_chunks
        (article_slug, article_title, chunk_index, content, embedding, source, category, region, tags, updated_at)
      VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, $9, NOW())
      ON CONFLICT (article_slug, chunk_index)
      DO UPDATE SET
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        article_title = EXCLUDED.article_title,
        source = EXCLUDED.source,
        category = EXCLUDED.category,
        region = EXCLUDED.region,
        tags = EXCLUDED.tags,
        updated_at = NOW()
    `, [r.slug, r.title, r.chunkIndex, r.content, embedding, r.source, r.category, r.region, r.tags]);
    upserted++;
    if (upserted % 20 === 0) process.stdout.write(`\r  ${upserted}/${records.length} rows upserted`);
  }
  console.log(`\n${upserted} chunks upserted into knowledge_chunks.`);

  // Show summary
  const { rows } = await db.query(`
    SELECT region, category, COUNT(*) as chunks
    FROM knowledge_chunks
    GROUP BY region, category
    ORDER BY region, category
  `);
  console.log('\nKnowledge base summary:');
  for (const row of rows) {
    console.log(`  ${row.region.padEnd(10)} ${row.category.padEnd(20)} ${row.chunks} chunks`);
  }

  await db.end();
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
