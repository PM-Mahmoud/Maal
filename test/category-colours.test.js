'use strict';

// test/category-colours.test.js
// Deterministic tests for shared/category-colours.mjs — the Spending category
// colour system: built-in mapping, hash fallback, custom-colour precedence,
// tints/inks and contrast. No DB, no network.

const assert = require('assert');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

(async () => {
  const c = await import('../shared/category-colours.mjs');
  const { GROUPS } = require('../lib/transaction-categories');
  const spendCats = require('../lib/spending-categories');
  console.log('\ncategory-colours');

  await test('every built-in group has a distinct light and dark colour', () => {
    assert.deepStrictEqual([...c.CATEGORY_GROUPS], [...GROUPS]);
    const lights = GROUPS.map((g) => c.categoryPair(g)[0]);
    const darks = GROUPS.map((g) => c.categoryPair(g)[1]);
    assert.strictEqual(new Set(lights).size, 18);
    assert.strictEqual(new Set(darks).size, 18);
    for (const h of [...lights, ...darks]) assert.match(h, /^#[0-9A-F]{6}$/);
  });

  await test('mapping is fixed for known groups', () => {
    assert.deepStrictEqual(c.categoryPair('Housing'), ['#1476D3', '#2F7FE0']);
    assert.deepStrictEqual(c.categoryPair('Food & Dining'), ['#D35F12', '#D76A1C']);
    assert.deepStrictEqual(c.categoryPair('Transfers'), ['#6B7786', '#7D8899']);
    assert.deepStrictEqual(c.categoryPair('  housing '), c.categoryPair('Housing'));
  });

  await test('income reads green, transfers neutral', () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.categoryPair('Income')[0].slice(i, i + 2), 16));
    assert.ok(g > r && g > b, 'income light is green-dominant');
    const [tr, tg, tb] = [1, 3, 5].map((i) => parseInt(c.categoryPair('Transfers')[0].slice(i, i + 2), 16));
    assert.ok(Math.max(tr, tg, tb) - Math.min(tr, tg, tb) < 40, 'transfers is low-saturation slate');
    assert.deepStrictEqual(c.DATA_COLOURS.income, c.categoryPair('Income'));
  });

  await test('marks meet 3:1 on the card surface (light relief band only for two)', () => {
    const relief = [];
    for (const g of GROUPS) {
      const [l, d] = c.categoryPair(g);
      assert.ok(c.contrast(d, c.SURFACES.dark) >= 3, `${g} dark ${d}`);
      if (c.contrast(l, c.SURFACES.light) < 3) relief.push(g);
    }
    assert.deepStrictEqual(relief.sort(), ['Bills & Utilities', 'Children']);
  });

  await test('unknown names fall back deterministically, never to income/transfers', () => {
    const a = c.categoryPair('Pet care');
    assert.deepStrictEqual(c.categoryPair('Pet care'), a);
    assert.deepStrictEqual(c.categoryPair('pet care'), a);
    assert.strictEqual(c.hashName('Pet care'), c.hashName('Pet care'));
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const p = c.categoryPair(`Mystery ${i}`);
      assert.notDeepStrictEqual(p, c.categoryPair('Income'));
      assert.notDeepStrictEqual(p, c.categoryPair('Transfers'));
      seen.add(p[0]);
    }
    assert.ok(seen.size >= 10, 'fallback spreads across the palette');
    assert.ok(Array.isArray(c.categoryPair('')) && Array.isArray(c.categoryPair(null)));
  });

  await test('custom category stored colour wins', () => {
    const custom = [
      { group: 'Housing', categories: [] }, // built-in item, no colour
      { group: 'Pet care', categories: [], custom: true, id: '1', kind: 'expense', color: '#3E7C6B', icon: 'dog' },
      { group: 'Gym', categories: [], custom: true, id: '2', kind: 'expense', color: c.CATEGORY_PALETTE['Housing'][0], icon: 'dumbbell' },
      { group: 'Broken', categories: [], custom: true, color: 'url(javascript:1)' },
    ];
    assert.deepStrictEqual(c.categoryPair('Pet care', custom), ['#3E7C6B', '#3E7C6B']);
    assert.deepStrictEqual(c.categoryPair('pet CARE', custom), ['#3E7C6B', '#3E7C6B']);
    // palette swatch -> its own dark step
    assert.deepStrictEqual(c.categoryPair('Gym', custom), c.CATEGORY_PALETTE['Housing']);
    // invalid stored colour is ignored -> fallback, never reflected
    assert.deepStrictEqual(c.categoryPair('Broken', custom), c.categoryPair('Broken'));
    // built-ins unaffected by an uncoloured list item
    assert.deepStrictEqual(c.categoryPair('Housing', custom), c.CATEGORY_PALETTE['Housing']);
    // { name, color } shape works too
    assert.deepStrictEqual(c.categoryPair('Pet care', [{ name: 'Pet care', color: '#a86e45' }]), ['#A86E45', '#A86E45']);
  });

  await test('income sources stay in the positive family', () => {
    const fam = ['Income', 'Savings & Investments', 'Travel & Lifestyle', 'Auto & Transport', 'Other'].map((g) => c.CATEGORY_PALETTE[g][0]);
    assert.deepStrictEqual(c.incomePair('Salary & wages'), c.CATEGORY_PALETTE['Income']);
    for (const n of ['Interest', 'Dividends', 'Refunds', 'Other income', 'Side hustle']) {
      assert.ok(fam.includes(c.incomePair(n)[0]), n);
      assert.deepStrictEqual(c.incomePair(n), c.incomePair(n));
    }
    assert.deepStrictEqual(c.incomePair('Tutoring', [{ group: 'Tutoring', custom: true, color: '#9759C3' }]), c.CATEGORY_PALETTE['Education']);
  });

  await test('tints are soft and inks readable on them', () => {
    for (const g of GROUPS) {
      const x = c.categoryColours(g);
      assert.ok(c.contrast(x.inkLight, x.tintLight) >= 4.5, `${g} light ink`);
      assert.ok(c.contrast(x.inkDark, x.tintDark) >= 4.5, `${g} dark ink`);
      assert.ok(c.contrast(x.tintLight, '#FFFFFF') < 1.5, `${g} light tint is soft`);
      assert.ok(c.contrast(x.tintDark, '#101010') < 2, `${g} dark tint is soft`);
    }
    const s = c.categoryStyle('Housing');
    assert.strictEqual(s['--cat'], 'light-dark(#1476D3, #2F7FE0)');
    assert.match(s['--cat-tint'], /^light-dark\(#[0-9A-F]{6}, #[0-9A-F]{6}\)$/);
  });

  await test('CSS data-role tokens match the module', () => {
    const css = require('fs').readFileSync(require('path').join(__dirname, '../client/src/components/maal/spending/category-colour.css'), 'utf8');
    const tok = (name) => (css.match(new RegExp(`--${name}:\\s*light-dark\\((#[0-9A-F]{6}),\\s*(#[0-9A-F]{6})\\)`, 'i')) || []).slice(1, 3);
    assert.deepStrictEqual(tok('sp-income'), [...c.DATA_COLOURS.income]);
    assert.deepStrictEqual(tok('sp-expense'), [...c.DATA_COLOURS.expense]);
    assert.deepStrictEqual(tok('sp-negative'), [...c.DATA_COLOURS.negative]);
    assert.deepStrictEqual(tok('sp-income-tint'), [c.tintOf(c.DATA_COLOURS.income[0], 'light'), c.tintOf(c.DATA_COLOURS.income[1], 'dark')]);
    assert.deepStrictEqual(tok('sp-expense-tint'), [c.tintOf(c.DATA_COLOURS.expense[0], 'light'), c.tintOf(c.DATA_COLOURS.expense[1], 'dark')]);
  });

  await test('picker swatches are all accepted by the server', () => {
    assert.strictEqual(c.PICKER_COLOURS.length, 20);
    for (const h of c.PICKER_COLOURS) assert.ok(spendCats.COLORS.includes(h), h);
    // legacy swatches stay valid for categories saved before the colour pass
    assert.ok(spendCats.COLORS.includes('#2F5D50'));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
