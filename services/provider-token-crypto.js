'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

function encryptionKey() {
  const dedicated = (process.env.PROVIDER_TOKEN_ENCRYPTION_KEY || '').trim();
  const developmentFallback = process.env.NODE_ENV === 'production'
    ? ''
    : (process.env.SESSION_SECRET || '').trim();
  const secret = dedicated || developmentFallback;
  if (!secret) throw new Error('PROVIDER_TOKEN_ENCRYPTION_KEY is required for provider tokens');
  return crypto.scryptSync(secret, 'hellomaal-provider-token-v1', 32);
}

function isConfigured() {
  return !!((process.env.PROVIDER_TOKEN_ENCRYPTION_KEY || '').trim()
    || (process.env.NODE_ENV !== 'production' && (process.env.SESSION_SECRET || '').trim()));
}

function encryptToken(plaintext) {
  if (!plaintext) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

function decryptToken(value) {
  if (!value) return null;
  const [version, iv, tag, ciphertext, extra] = String(value).split('.');
  if (version !== VERSION || !iv || !tag || !ciphertext || extra !== undefined) {
    throw new Error('Invalid encrypted provider token');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

module.exports = { isConfigured, encryptToken, decryptToken };
