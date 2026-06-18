// services/extract.js — pull plain text out of uploaded documents so Maal can
// actually read them (Ask Maal context + figure extraction).
//
// Text-based formats only: PDFs that have a text layer, Word (.docx), and
// CSV/TXT. Scanned PDFs and photos of statements have no text layer and need
// OCR (Azure Document Intelligence) — that's a later pass; they return ''.
//
// Heavy parsers (pdf-parse, mammoth) are lazy-required inside try/catch so a
// missing dependency or a malformed file can never crash an upload — we just
// store the file with no extracted text and the doc simply isn't readable yet.

const TEXT_LIKE = /^(text\/|application\/(csv|json|xml))/i;

async function extractText(buffer, mime, filename) {
  if (!buffer || !buffer.length) return '';
  const name = String(filename || '').toLowerCase();
  const type = String(mime || '').toLowerCase();
  try {
    if (type === 'application/pdf' || name.endsWith('.pdf')) {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return clean(data && data.text);
    }
    if (type.indexOf('wordprocessingml') !== -1 || name.endsWith('.docx')) {
      const mammoth = require('mammoth');
      const r = await mammoth.extractRawText({ buffer });
      return clean(r && r.value);
    }
    if (TEXT_LIKE.test(type) || name.endsWith('.csv') || name.endsWith('.txt')) {
      return clean(buffer.toString('utf8'));
    }
  } catch (e) {
    console.error('extractText failed for', filename, '—', e.message);
  }
  return ''; // unsupported type (xlsx, images, scans) — no readable text yet
}

function clean(s) {
  return String(s || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 100000); // hard cap so one giant doc can't bloat the row
}

module.exports = { extractText };
