// services/storage.js
// S3-compatible object storage adapter for Vault documents.
//
// Works with Cloudflare R2 (recommended — zero egress fees), Backblaze B2, or
// AWS S3; they all speak the S3 API, so only the env vars differ. Vault stored
// raw file bytes as Postgres `bytea`, which meant every upload and download
// pushed the full file through Neon and counted against its network-transfer
// allowance. Moving the bytes here keeps Postgres holding only metadata and
// extracted text.
//
// Configuration (all required to enable object storage; if any is missing the
// adapter reports isConfigured() === false and Vault transparently falls back
// to bytea):
//   STORAGE_ENDPOINT          e.g. https://<accountid>.r2.cloudflarestorage.com
//   STORAGE_BUCKET            e.g. maal-vault
//   STORAGE_ACCESS_KEY_ID
//   STORAGE_SECRET_ACCESS_KEY
//   STORAGE_REGION            optional, defaults to 'auto' (correct for R2)
//
// The AWS SDK is required lazily inside the client getter so it never loads for
// deployments that don't use object storage.

const crypto = require('crypto');

function cfg() {
  return {
    endpoint: (process.env.STORAGE_ENDPOINT || '').trim(),
    bucket: (process.env.STORAGE_BUCKET || '').trim(),
    accessKeyId: (process.env.STORAGE_ACCESS_KEY_ID || '').trim(),
    secretAccessKey: (process.env.STORAGE_SECRET_ACCESS_KEY || '').trim(),
    region: (process.env.STORAGE_REGION || 'auto').trim(),
  };
}

// True only when every credential is present. Vault checks this to decide
// between object storage and the bytea fallback.
function isConfigured() {
  const c = cfg();
  return !!(c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey);
}

let _client = null;
function client() {
  if (_client) return _client;
  const c = cfg();
  const { S3Client } = require('@aws-sdk/client-s3');
  _client = new S3Client({
    region: c.region,
    endpoint: c.endpoint,
    // R2/B2 require path-style addressing (bucket in the path, not the host).
    forcePathStyle: true,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
  return _client;
}

// Deterministic-ish object key: namespaced by user so listings/cleanup are
// simple, with a random component so filenames can't collide or be guessed.
function keyFor(userId, filename) {
  const safe = String(filename || 'document')
    .replace(/[^a-zA-Z0-9._-]/g, '_')   // drop separators and unsafe chars
    .replace(/\.{2,}/g, '.')            // collapse .. so no traversal-looking runs
    .replace(/^\.+/, '')               // no leading dots
    .slice(0, 120) || 'document';
  return `vault/${userId}/${crypto.randomUUID()}-${safe}`;
}

async function putObject(key, buffer, contentType) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await client().send(new PutObjectCommand({
    Bucket: cfg().bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
  }));
  return key;
}

// Returns the object as a Buffer. Kept as a buffer (rather than a stream) so the
// Vault download routes stay unchanged — they already res.send(content).
async function getObject(key) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const out = await client().send(new GetObjectCommand({ Bucket: cfg().bucket, Key: key }));
  const chunks = [];
  for await (const chunk of out.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function deleteObject(key) {
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  await client().send(new DeleteObjectCommand({ Bucket: cfg().bucket, Key: key }));
}

module.exports = { isConfigured, keyFor, putObject, getObject, deleteObject };
