'use strict';
// Deterministic tests for services/basiq-institutions.js (Basiq institution
// mapping, AU fallback list, search ranking) and the consent-URL preselect.

const assert = require('assert');
const inst = require('../services/basiq-institutions');

let passed = 0;
let failed = 0;
const pending = [];
function test(name, fn) {
  const run = async () => {
    try { await fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
  };
  pending.push(run);
}

console.log('\nbasiq institutions');

const RAW_CBA = {
  type: 'institution',
  id: 'AU00301',
  name: 'Commonwealth Bank of Australia',
  shortName: 'CommBank',
  institutionType: 'Bank',
  tier: '1',
  status: 'operational',
  loginIdCaption: 'Client number',
  passwordCaption: 'Password',
  logo: { type: 'image', colors: { primary: '#FFCC00' }, links: { square: 'https://cdn.basiq.io/logos/cba-square.png', full: 'https://cdn.basiq.io/logos/cba-full.png' } },
};

test('maps a Basiq row to the public whitelist shape only', () => {
  const m = inst.mapInstitution(RAW_CBA);
  assert.deepStrictEqual(m, {
    id: 'AU00301',
    slug: 'commbank',
    name: 'Commonwealth Bank of Australia',
    shortName: 'CommBank',
    category: 'bank',
    logo: 'https://cdn.basiq.io/logos/cba-square.png',
    url: null,
  });
  assert.ok(!('loginIdCaption' in m) && !('tier' in m));
});

test('falls back to the full logo, then a local logo, and rejects non-https logos', () => {
  assert.strictEqual(inst.mapInstitution({ ...RAW_CBA, logo: { links: { full: 'https://cdn.basiq.io/f.png' } } }).logo, 'https://cdn.basiq.io/f.png');
  assert.strictEqual(inst.mapInstitution({ ...RAW_CBA, logo: { links: { square: 'http://evil.example/x.png' } } }).logo, '/images/banks/commbank.png');
  assert.strictEqual(inst.mapInstitution({ ...RAW_CBA, logo: { links: { square: 'javascript:alert(1)' } } }).logo, '/images/banks/commbank.png');
  assert.strictEqual(inst.mapInstitution({ ...RAW_CBA, name: 'Tiny Credit Union', shortName: '', logo: null }).logo, null);
});

test('drops rows without a valid id/name or in a major outage', () => {
  assert.strictEqual(inst.mapInstitution(null), null);
  assert.strictEqual(inst.mapInstitution({ ...RAW_CBA, id: 'x' }), null);
  assert.strictEqual(inst.mapInstitution({ ...RAW_CBA, id: 'AU00301; DROP' }), null);
  assert.strictEqual(inst.mapInstitution({ ...RAW_CBA, name: '   ' }), null);
  assert.strictEqual(inst.mapInstitution({ ...RAW_CBA, status: 'major-outage' }), null);
  assert.ok(inst.mapInstitution({ ...RAW_CBA, status: 'partial-outage' }));
});

test('categorises super funds and brokers', () => {
  assert.strictEqual(inst.categorise('Superannuation'), 'super');
  assert.strictEqual(inst.categorise('Super Fund'), 'super');
  assert.strictEqual(inst.categorise('Investment'), 'investment');
  assert.strictEqual(inst.categorise('Online Broker'), 'investment');
  assert.strictEqual(inst.categorise('Credit Union'), 'bank');
  assert.strictEqual(inst.categorise(undefined), 'bank');
});

test('mapInstitutions de-duplicates by id and sorts by name', () => {
  const list = inst.mapInstitutions([
    { ...RAW_CBA, id: 'AU00002', name: 'Westpac', shortName: 'Westpac' },
    RAW_CBA,
    RAW_CBA,
    { id: 'bad' },
  ]);
  assert.deepStrictEqual(list.map((i) => i.id), ['AU00301', 'AU00002']);
  assert.deepStrictEqual(inst.mapInstitutions('nope'), []);
});

test('static fallback covers the major AU banks, super funds and brokers', () => {
  const slugs = inst.STATIC_INSTITUTIONS.map((i) => i.slug);
  for (const s of ['commbank', 'westpac', 'nab', 'anz', 'macquarie', 'ing', 'bendigo', 'up', 'ubank', 'suncorp', 'boq', 'bankwest', 'stgeorge', 'amp', 'hsbc',
    'australiansuper', 'hostplus', 'art', 'unisuper', 'commsec', 'stake', 'pearler', 'superhero']) {
    assert.ok(slugs.includes(s), `missing ${s}`);
  }
  assert.ok(inst.STATIC_INSTITUTIONS.every((i) => i.id === null && inst.CATEGORIES.includes(i.category)));
  assert.ok(Object.isFrozen(inst.STATIC_INSTITUTIONS));
});

test('popular grid follows the curated order', () => {
  const pop = inst.pickPopular(inst.STATIC_INSTITUTIONS);
  assert.strictEqual(pop.length, 12);
  assert.deepStrictEqual(pop.slice(0, 4).map((i) => i.slug), ['commbank', 'westpac', 'nab', 'anz']);
  assert.deepStrictEqual(inst.pickPopular([]), []);
});

test('search ranks exact, prefix, word-prefix, then substring', () => {
  const list = [
    { id: '1', name: 'Bank Australia', shortName: 'Bank Australia', category: 'bank' },
    { id: '2', name: 'Commonwealth Bank of Australia', shortName: 'CommBank', category: 'bank' },
    { id: '3', name: 'CommSec', shortName: 'CommSec', category: 'investment' },
    { id: '4', name: 'Bendigo Bank', shortName: 'Bendigo', category: 'bank' },
  ];
  assert.deepStrictEqual(inst.searchInstitutions(list, 'commbank').map((i) => i.id), ['2']);
  assert.deepStrictEqual(inst.searchInstitutions(list, 'comm').map((i) => i.id), ['2', '3']);
  assert.deepStrictEqual(inst.searchInstitutions(list, 'bank').map((i) => i.id), ['1', '4', '2']);
  assert.deepStrictEqual(inst.searchInstitutions(list, 'comm', { category: 'investment' }).map((i) => i.id), ['3']);
  assert.deepStrictEqual(inst.searchInstitutions(list, '').map((i) => i.id), []);
  assert.strictEqual(inst.searchInstitutions(list, '', { category: 'bank' }).length, 3);
});

test('consent URL preselects only a well-formed institution id', async () => {
  const realFetch = global.fetch;
  const realKey = process.env.BASIQ_API_KEY;
  process.env.BASIQ_API_KEY = 'test-key-not-real';
  global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'tok' }) });
  try {
    delete require.cache[require.resolve('../services/basiq')];
    const basiq = require('../services/basiq');
    const withId = await basiq.getConsentUrl('user-1', 'connect', { institutionId: 'AU00301' });
    assert.ok(withId.endsWith('&action=connect&institutionId=AU00301'));
    const bad = await basiq.getConsentUrl('user-1', 'connect', { institutionId: 'AU1&x=y' });
    assert.ok(!bad.includes('institutionId'));
    const legacy = await basiq.getConsentUrl('user-1');
    assert.ok(legacy.endsWith('&action=connect'));
  } finally {
    global.fetch = realFetch;
    if (realKey === undefined) delete process.env.BASIQ_API_KEY; else process.env.BASIQ_API_KEY = realKey;
  }
});

test('listInstitutions maps and caches the Basiq catalogue', async () => {
  const realFetch = global.fetch;
  const realKey = process.env.BASIQ_API_KEY;
  process.env.BASIQ_API_KEY = 'test-key-not-real';
  let institutionCalls = 0;
  global.fetch = async (url) => {
    if (String(url).endsWith('/institutions')) {
      institutionCalls++;
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: [RAW_CBA, { id: 'nope' }] }) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'tok' }) };
  };
  try {
    delete require.cache[require.resolve('../services/basiq')];
    const basiq = require('../services/basiq');
    const first = await basiq.listInstitutions();
    const second = await basiq.listInstitutions();
    assert.strictEqual(first.length, 1);
    assert.strictEqual(first[0].slug, 'commbank');
    assert.strictEqual(second, first);
    assert.strictEqual(institutionCalls, 1);
  } finally {
    global.fetch = realFetch;
    if (realKey === undefined) delete process.env.BASIQ_API_KEY; else process.env.BASIQ_API_KEY = realKey;
    delete require.cache[require.resolve('../services/basiq')];
  }
});

(async () => {
  for (const run of pending) await run();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
})();
