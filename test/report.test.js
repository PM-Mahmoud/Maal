'use strict';

// test/report.test.js
// Tests for services/report.js: buildActionPlan (pure, derived from Maal Score
// pillars) and a smoke test that renderReportPdf produces a valid PDF. No DB.

const assert = require('assert');
const { buildActionPlan, renderReportPdf, renderResearchPdf, sanitize } = require('../services/report');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

const maal = {
  score: 62,
  band: 'Fair',
  pillars: [
    { key: 'savings', label: 'Savings buffer', score: 20, weight: 0.25 },
    { key: 'debt', label: 'Debt health', score: 90, weight: 0.25 },
    { key: 'super', label: 'Super adequacy', score: 40, weight: 0.20 },
    { key: 'wealth', label: 'Wealth trajectory', score: 30, weight: 0.15 },
    { key: 'protection', label: 'Protection', score: 80, weight: 0.15 },
  ],
};

console.log('\nbuildActionPlan');

test('always returns exactly 5 steps', () => {
  assert.strictEqual(buildActionPlan(maal).length, 5);
  assert.strictEqual(buildActionPlan({}).length, 5);
  assert.strictEqual(buildActionPlan(null).length, 5);
});

test('leads with the three weakest pillars (savings, wealth, super here)', () => {
  const plan = buildActionPlan(maal);
  assert.ok(/cash buffer/i.test(plan[0]), 'weakest = savings (20)');
  assert.ok(/net worth/i.test(plan[1]), 'next = wealth (30)');
  assert.ok(/super|ASFA/i.test(plan[2]), 'next = super (40)');
});

test('last step is always the education-only disclaimer', () => {
  const plan = buildActionPlan(maal);
  assert.ok(/educational only/i.test(plan[4]));
});

console.log('\nrenderReportPdf (smoke)');

(async () => {
  await (async function () {
    const model = {
      user: { email: 'test@example.com' },
      maal,
      snap: { netWorth: 500000, assetsTotal: 600000, debtsTotal: 100000, cashBalance: 20000, investBalance: 80000, superBalance: 120000 },
      retirement: { projectedBalance: 700000, asfaTarget: 595000, gap: 0, retirementAge: 67 },
      actionPlan: buildActionPlan(maal),
    };
    try {
      const out = await renderReportPdf(model);
      assert.ok(out.filename.endsWith('.pdf'), 'filename is a .pdf');
      const buf = Buffer.from(out.base64, 'base64');
      assert.ok(buf.length > 500, 'PDF has real bytes');
      assert.strictEqual(buf.slice(0, 5).toString(), '%PDF-', 'valid PDF header');
      console.log('  ✓ produces a valid PDF (' + buf.length + ' bytes)');
      passed++;
    } catch (e) {
      console.error('  ✗ produces a valid PDF'); console.error(`    ${e.message}`); failed++;
    }

    // Handles a null retirement (no projection) without throwing.
    try {
      const out = await renderReportPdf({ user: {}, maal: {}, snap: { netWorth: 0, assetsTotal: 0, debtsTotal: 0, cashBalance: 0, investBalance: 0, superBalance: 0 }, retirement: null, actionPlan: buildActionPlan({}) });
      assert.strictEqual(Buffer.from(out.base64, 'base64').slice(0, 5).toString(), '%PDF-');
      console.log('  ✓ handles empty profile / null retirement');
      passed++;
    } catch (e) {
      console.error('  ✗ handles empty profile / null retirement'); console.error(`    ${e.message}`); failed++;
    }

    // Deep-research PDF (PR 8): branded, multi-section, with quant + chart.
    try {
      const quant = {
        hasData: true,
        perSymbol: [{
          symbol: 'AAPL', lastPrice: 210.5, annualizedReturn: 0.18, annualizedVol: 0.27,
          beta: 1.2, maxDrawdown: -0.31, var95: 0.033,
          monteCarlo: { sims: 1000, days: 252, terminal: { p5: 8200, p50: 11800, p95: 16900 } },
        }],
      };
      const body = {
        title: 'Is AAPL too risky for me?',
        summary: 'A concise summary with a minus sign -5% and approx ~ and sqrt.',
        sections: [{ heading: 'Volatility', body: 'Lorem ipsum '.repeat(40) }],
      };
      const out = await renderResearchPdf({ user: { email: 'a@b.co' }, question: body.title, body, quant, sources: [{ title: 'ATO', url: 'https://ato.gov.au', source: 'ato.gov.au' }] });
      assert.ok(out.filename.startsWith('maal-research-') && out.filename.endsWith('.pdf'));
      const buf = Buffer.from(out.base64, 'base64');
      assert.ok(buf.length > 800, 'research PDF has real bytes');
      assert.strictEqual(buf.slice(0, 5).toString(), '%PDF-', 'valid PDF header');
      console.log('  ✓ renderResearchPdf produces a valid branded PDF (' + buf.length + ' bytes)');
      passed++;
    } catch (e) {
      console.error('  ✗ renderResearchPdf produces a valid branded PDF'); console.error(`    ${e.message}`); failed++;
    }

    // sanitize maps the analysis glyphs to faithful ASCII (not dropped/"?").
    try {
      assert.strictEqual(sanitize('−5% ≈ √x × y ÷ z ±1 ≤ ≥'), '-5% ~ sqrtx x y / z +/-1 <= >=');
      console.log('  ✓ sanitize maps unicode maths glyphs to ASCII');
      passed++;
    } catch (e) {
      console.error('  ✗ sanitize maps unicode maths glyphs to ASCII'); console.error(`    ${e.message}`); failed++;
    }

    console.log(`\n${passed} passed, ${failed} failed\n`);
    if (failed > 0) process.exit(1);
  })();
})();
