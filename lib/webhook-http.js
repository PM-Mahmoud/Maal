'use strict';

const dns = require('node:dns/promises');
const http = require('node:http');
const https = require('node:https');
const { isIP } = require('node:net');
const { validateWebhookUrl, isPublicWebhookAddress } = require('./extensibility');

const MAX_RESPONSE_SAMPLE_BYTES = 2048;

async function postWebhook(url, options, { lookup = dns.lookup, request = null } = {}) {
  const destination = new URL(validateWebhookUrl(url));
  const hostname = destination.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(hostname);
  const addresses = family
    ? [{ address: hostname, family }]
    : await lookup(hostname, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some(({ address }) => !isPublicWebhookAddress(address))) {
    throw new Error('Webhook destination must resolve to public addresses');
  }
  options.signal?.throwIfAborted();
  const send = request || (destination.protocol === 'https:' ? https.request : http.request);
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error('Could not connect to webhook'));
    // The socket reuses the exact vetted resolution and retains the original
    // hostname for Host and TLS validation. Native requests never follow a 3xx.
    const req = send(destination, {
      method: options.method,
      headers: { ...options.headers, 'Content-Length': Buffer.byteLength(options.body) },
      signal: options.signal,
      agent: false,
      lookup: (_name, lookupOptions, callback) => {
        if (lookupOptions.all) return callback(null, addresses);
        const entry = addresses.find((item) => !lookupOptions.family || item.family === lookupOptions.family);
        if (!entry) return callback(new Error('No eligible webhook address family'));
        return callback(null, entry.address, entry.family);
      },
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        const sample = chunk.subarray(0, MAX_RESPONSE_SAMPLE_BYTES - size);
        if (sample.length) {
          chunks.push(sample);
          size += sample.length;
        }
      });
      res.on('error', fail);
      res.on('aborted', fail);
      res.on('end', () => resolve({
        status: res.statusCode,
        ok: res.statusCode >= 200 && res.statusCode < 300,
        text: () => Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', fail);
    req.end(options.body);
  });
}

module.exports = { postWebhook };
