// services/basiq-institutions.js
// PURE helpers for the "Connect your accounts" institution picker.
//
// - mapInstitution(): Basiq /institutions row → the small public shape the
//   client renders. Institution metadata is public (not CDR consumer data),
//   but it still goes through this whitelist so nothing unexpected (or any
//   future field) leaks to the browser.
// - STATIC_INSTITUTIONS: major Australian banks, super funds and brokers,
//   shown when BASIQ_API_KEY is not set (demo mode) or Basiq is unreachable.
// - searchInstitutions(): deterministic ranking used by tests and the server.
//
// No I/O here — deterministic tests live in test/basiq-institutions.test.js.

const CATEGORIES = ['bank', 'super', 'investment'];

// Local logo files that already ship in public/images/banks/.
const LOCAL_LOGOS = new Set([
  'anz', 'australiansuper', 'banksa', 'bendigo', 'commbank', 'commsec', 'hostplus',
  'hsbc', 'ing', 'macquarie', 'nab', 'selfwealth', 'stgeorge', 'suncorp', 'ubank', 'up', 'westpac',
]);

// slug, display name, category, website. `id` is null: without Basiq we
// cannot preselect an institution in the consent screen.
const STATIC_ROWS = [
  ['commbank', 'CommBank', 'bank', 'commbank.com.au'],
  ['westpac', 'Westpac', 'bank', 'westpac.com.au'],
  ['nab', 'NAB', 'bank', 'nab.com.au'],
  ['anz', 'ANZ', 'bank', 'anz.com.au'],
  ['macquarie', 'Macquarie', 'bank', 'macquarie.com.au'],
  ['ing', 'ING', 'bank', 'ing.com.au'],
  ['up', 'Up', 'bank', 'up.com.au'],
  ['ubank', 'ubank', 'bank', 'ubank.com.au'],
  ['bendigo', 'Bendigo Bank', 'bank', 'bendigobank.com.au'],
  ['stgeorge', 'St.George', 'bank', 'stgeorge.com.au'],
  ['suncorp', 'Suncorp', 'bank', 'suncorp.com.au'],
  ['bankwest', 'Bankwest', 'bank', 'bankwest.com.au'],
  ['boq', 'BOQ', 'bank', 'boq.com.au'],
  ['amp', 'AMP Bank', 'bank', 'amp.com.au'],
  ['hsbc', 'HSBC Australia', 'bank', 'hsbc.com.au'],
  ['banksa', 'BankSA', 'bank', 'banksa.com.au'],
  ['greatsouthern', 'Great Southern Bank', 'bank', 'greatsouthernbank.com.au'],
  ['bankaustralia', 'Bank Australia', 'bank', 'bankaustralia.com.au'],
  ['australiansuper', 'AustralianSuper', 'super', 'australiansuper.com'],
  ['hostplus', 'Hostplus', 'super', 'hostplus.com.au'],
  ['art', 'Australian Retirement Trust', 'super', 'australianretirementtrust.com.au'],
  ['unisuper', 'UniSuper', 'super', 'unisuper.com.au'],
  ['aware', 'Aware Super', 'super', 'aware.com.au'],
  ['rest', 'Rest', 'super', 'rest.com.au'],
  ['commsec', 'CommSec', 'investment', 'commsec.com.au'],
  ['stake', 'Stake', 'investment', 'hellostake.com'],
  ['pearler', 'Pearler', 'investment', 'pearler.com'],
  ['superhero', 'Superhero', 'investment', 'superhero.com.au'],
  ['selfwealth', 'SelfWealth', 'investment', 'selfwealth.com.au'],
];

const STATIC_INSTITUTIONS = Object.freeze(STATIC_ROWS.map(([slug, name, category, site]) => Object.freeze({
  id: null,
  slug,
  name,
  shortName: name,
  category,
  logo: LOCAL_LOGOS.has(slug) ? `/images/banks/${slug}.png` : null,
  url: `https://www.${site}`,
})));

// Order of the "Popular institutions" grid.
const POPULAR_SLUGS = ['commbank', 'westpac', 'nab', 'anz', 'macquarie', 'ing', 'up', 'ubank', 'bendigo', 'stgeorge', 'suncorp', 'bankwest'];

// Normalised name → slug for matching Basiq's names to our known brands.
const ALIASES = {
  commbank: 'commbank', commonwealthbank: 'commbank', commonwealthbankofaustralia: 'commbank', cba: 'commbank',
  westpac: 'westpac', westpacbank: 'westpac', westpacbankingcorporation: 'westpac',
  nab: 'nab', nationalaustraliabank: 'nab',
  anz: 'anz', anzbank: 'anz', australiaandnewzealandbankinggroup: 'anz', australiaandnewzealandbank: 'anz',
  macquarie: 'macquarie', macquariebank: 'macquarie',
  ing: 'ing', ingaustralia: 'ing', ingdirect: 'ing',
  up: 'up', upbank: 'up', upbanking: 'up',
  ubank: 'ubank',
  bendigo: 'bendigo', bendigobank: 'bendigo', bendigoandadelaidebank: 'bendigo',
  stgeorge: 'stgeorge', stgeorgebank: 'stgeorge',
  suncorp: 'suncorp', suncorpbank: 'suncorp',
  bankwest: 'bankwest',
  boq: 'boq', bankofqueensland: 'boq',
  amp: 'amp', ampbank: 'amp',
  hsbc: 'hsbc', hsbcaustralia: 'hsbc', hsbcbankaustralia: 'hsbc',
  banksa: 'banksa',
  greatsouthernbank: 'greatsouthern',
  bankaustralia: 'bankaustralia',
  australiansuper: 'australiansuper',
  hostplus: 'hostplus',
  australianretirementtrust: 'art',
  unisuper: 'unisuper',
  awaresuper: 'aware',
  rest: 'rest', restsuper: 'rest',
  commsec: 'commsec', commonwealthsecurities: 'commsec',
  stake: 'stake',
  pearler: 'pearler',
  superhero: 'superhero',
  selfwealth: 'selfwealth',
};

function normalise(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function slugFor(name, shortName) {
  return ALIASES[normalise(shortName)] || ALIASES[normalise(name)] || null;
}

function categorise(institutionType) {
  const t = String(institutionType || '').toLowerCase();
  if (/super/.test(t)) return 'super';
  if (/invest|broker|wealth|trading|securit|share/.test(t)) return 'investment';
  return 'bank';
}

// Only absolute https URLs are passed through to <img src>.
function safeHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function cleanText(value, max = 120) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

const BASIQ_ID = /^[A-Z]{2}\d{5}$/;

function isBasiqInstitutionId(value) {
  return typeof value === 'string' && BASIQ_ID.test(value);
}

/**
 * Basiq institution row → { id, slug, name, shortName, category, logo, url }.
 * Returns null for rows that can't be shown (no id/name, or not operational).
 */
function mapInstitution(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = cleanText(raw.name);
  if (!isBasiqInstitutionId(id) || !name) return null;
  const status = String(raw.status || 'operational').toLowerCase();
  if (status === 'major-outage' || status === 'unavailable') return null;
  const shortName = cleanText(raw.shortName) || name;
  const links = (raw.logo && raw.logo.links) || {};
  const slug = slugFor(name, shortName);
  return {
    id,
    slug,
    name,
    shortName,
    category: categorise(raw.institutionType),
    logo: safeHttpsUrl(links.square) || safeHttpsUrl(links.full) || (slug && LOCAL_LOGOS.has(slug) ? `/images/banks/${slug}.png` : null),
    url: safeHttpsUrl(raw.url) || safeHttpsUrl(raw.website) || null,
  };
}

function mapInstitutions(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const m = mapInstitution(row);
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'en-AU'));
}

/** The popular grid: POPULAR_SLUGS order, from whatever list is live. */
function pickPopular(list, limit = 12) {
  const bySlug = new Map();
  for (const inst of list || []) if (inst.slug && !bySlug.has(inst.slug)) bySlug.set(inst.slug, inst);
  const out = [];
  for (const slug of POPULAR_SLUGS) {
    const hit = bySlug.get(slug);
    if (hit) out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Ranked search: exact > prefix > word prefix > substring. Ties keep
 * alphabetical order. Empty query returns [] (the picker shows Popular).
 */
function searchInstitutions(list, query, { category, limit = 50 } = {}) {
  const q = normalise(query);
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!q && !category) return [];
  const scored = [];
  for (const inst of list || []) {
    if (category && inst.category !== category) continue;
    const name = normalise(inst.name);
    const short = normalise(inst.shortName);
    let score;
    if (!q) score = 4;
    else if (name === q || short === q) score = 0;
    else if (name.startsWith(q) || short.startsWith(q)) score = 1;
    else if (words.length && words.every((w) => inst.name.toLowerCase().split(/[\s\-.&()]+/).some((part) => part.startsWith(w.replace(/[^a-z0-9]/g, ''))))) score = 2;
    else if (name.includes(q) || short.includes(q)) score = 3;
    else continue;
    scored.push({ inst, score });
  }
  scored.sort((a, b) => a.score - b.score || a.inst.name.localeCompare(b.inst.name, 'en-AU'));
  return scored.slice(0, limit).map((s) => s.inst);
}

module.exports = {
  CATEGORIES,
  STATIC_INSTITUTIONS,
  POPULAR_SLUGS,
  normalise,
  slugFor,
  categorise,
  safeHttpsUrl,
  isBasiqInstitutionId,
  mapInstitution,
  mapInstitutions,
  pickPopular,
  searchInstitutions,
};
