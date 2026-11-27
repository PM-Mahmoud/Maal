'use strict';

function citationUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return;
  try {
    const url = new URL(value);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) return url.href;
  } catch {
    // Invalid links are represented by their label only.
  }
}

function citation(value) {
  if (!value || typeof value.label !== 'string' || !value.label.trim()) return;
  const link = citationUrl(value.url);
  const label = value.label.trim().slice(0, 120);
  return link ? { label, url: link } : { label };
}

module.exports = { citation };
