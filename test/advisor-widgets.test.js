'use strict';
// Deterministic tests for services/advisor-widgets.js — the generative-UI layer
// for Ask Maal. No model/network: we test directive parsing, source whitelist
// enforcement, server-side data computation, and internal-only citations.

const assert = require('assert');
const W = require('../services/advisor-widgets');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.error('  ✗ ' + name); console.error('    ' + e.message); failed++; }
}

const ctx = {
  profile: { cash_savings: 20000, investment_portfolio: 30000, super_balance: 50000, property_value: 0 },
  maal: { hasData: true, score: 72, band: 'Good', pillars: [{ label: 'Savings buffer', score: 80 }, { label: 'Debt', score: 60 }] },
  snapshots: [
    { snapshot_date: '2026-05-01', net_worth: 90000 },
    { snapshot_date: '2026-06-01', net_worth: 95000 },
    { snapshot_date: '2026-07-01', net_worth: 100000 },
  ],
  transactions: [{ amount: 5000 }, { amount: -1200 }, { amount: -800 }],
  goals: [{ name: 'House deposit', current: 40000, target: 100000 }],
};

console.log('\nparseDirectives');

test('extracts a widget request and strips the fenced block from the reply', () => {
  const raw = 'Here is your split.\n```maal-widget {"source":"networth_composition","title":"Your money"}```\nHope that helps.';
  const p = W.parseDirectives(raw);
  assert.strictEqual(p.widgetRequests.length, 1);
  assert.strictEqual(p.widgetRequests[0].source, 'networth_composition');
  assert.strictEqual(p.widgetRequests[0].title, 'Your money');
  assert.ok(!p.text.includes('maal-widget'), 'block stripped from visible text');
  assert.ok(p.text.includes('Here is your split.') && p.text.includes('Hope that helps.'));
});

test('extracts follow-up questions (max 3) and strips them', () => {
  const raw = 'Answer.\n```maal-followups ["A?","B?","C?","D?"]```';
  const p = W.parseDirectives(raw);
  assert.deepStrictEqual(p.followUps, ['A?', 'B?', 'C?']);
  assert.ok(!p.text.includes('maal-followups'));
});

test('malformed JSON in a directive is ignored, not thrown', () => {
  const p = W.parseDirectives('Text\n```maal-widget {not json}```');
  assert.strictEqual(p.widgetRequests.length, 0);
  assert.strictEqual(p.text, 'Text');
});

test('plain reply with no directives passes through unchanged', () => {
  const p = W.parseDirectives('Just words.');
  assert.strictEqual(p.text, 'Just words.');
  assert.strictEqual(p.widgetRequests.length, 0);
  assert.deepStrictEqual(p.followUps, []);
});

console.log('\nbuildWidgets (whitelist + server-side data)');

test('unknown sources are dropped (whitelist is authoritative)', () => {
  const built = W.buildWidgets([{ source: 'drop_tables' }, { source: 'networth_composition' }], ctx);
  assert.strictEqual(built.length, 1);
  assert.strictEqual(built[0].source, 'networth_composition');
});

test('donut data is computed from the user profile, not the model', () => {
  const [w] = W.buildWidgets([{ source: 'networth_composition' }], ctx);
  assert.strictEqual(w.type, 'donut');
  assert.strictEqual(w.data.total, 100000);
  const cash = w.data.segments.find((s) => s.label === 'Cash & savings');
  assert.strictEqual(cash.value, 20000);
  assert.strictEqual(cash.pct, 20);
  assert.ok(!w.data.segments.some((s) => s.label === 'Property'), 'zero-value segment excluded');
});

test('cashflow summary sums the real transactions', () => {
  const [w] = W.buildWidgets([{ source: 'cashflow_summary' }], ctx);
  assert.strictEqual(w.type, 'stat-cards');
  const byLabel = Object.fromEntries(w.data.cards.map((c) => [c.label, c.value]));
  assert.strictEqual(byLabel['Money in'], '$5,000');
  assert.strictEqual(byLabel['Money out'], '$2,000');
  assert.ok(byLabel['Net'].includes('3,000'));
});

test('line trend needs ≥2 points; empty data renders nothing', () => {
  const [w] = W.buildWidgets([{ source: 'net_worth_trend' }], ctx);
  assert.strictEqual(w.data.points.length, 3);
  const none = W.buildWidgets([{ source: 'net_worth_trend' }], { snapshots: [{ net_worth: 1 }] });
  assert.strictEqual(none.length, 0, 'single-point trend is dropped');
});

test('de-dupes repeated sources and caps at 2 widgets', () => {
  const built = W.buildWidgets(
    [{ source: 'networth_composition' }, { source: 'networth_composition' }, { source: 'score_breakdown' }, { source: 'goals_summary' }],
    ctx
  );
  assert.strictEqual(built.length, 2);
  assert.strictEqual(built[0].source, 'networth_composition');
  assert.strictEqual(built[1].source, 'score_breakdown');
});

test('empty context yields no widgets (never an empty chart)', () => {
  const built = W.buildWidgets([{ source: 'networth_composition' }, { source: 'goals_summary' }], { profile: {}, goals: [] });
  assert.strictEqual(built.length, 0);
});

console.log('\ninternalCitations (cite app data, never web/RAG)');

test('citations come from the widgets used + vault doc, not external sources', () => {
  const built = W.buildWidgets([{ source: 'networth_composition' }], ctx);
  const cites = W.internalCitations(built, { isaacusGrounding: { filename: 'payslip.pdf' } });
  const labels = cites.map((c) => c.label);
  assert.ok(labels.includes('Your portfolio'));
  assert.ok(labels.includes('Vault: payslip.pdf'));
  // Nothing resembling a web/knowledge source.
  assert.ok(!labels.some((l) => /http|knowledge|source \[/i.test(l)));
});

test('no widgets and no vault doc → no citations', () => {
  assert.deepStrictEqual(W.internalCitations([], {}), []);
});

console.log('\nrenderSaved (dashboard live re-render)');

test('renders a saved widget live from its source', () => {
  const spec = W.renderSaved('score_breakdown', 'My score', ctx);
  assert.strictEqual(spec.type, 'table');
  assert.strictEqual(spec.title, 'My score');
  assert.strictEqual(spec.data.rows.length, 2);
});

test('unknown or empty saved source returns null', () => {
  assert.strictEqual(W.renderSaved('bogus', 't', ctx), null);
  assert.strictEqual(W.renderSaved('goals_summary', 't', { goals: [] }), null);
});

console.log('\nwidgetInstructions');

test('instruction block lists only whitelisted sources', () => {
  const instr = W.widgetInstructions();
  Object.keys(W.WIDGET_SOURCES).forEach((s) => assert.ok(instr.includes(s), 'mentions ' + s));
  assert.ok(instr.includes('maal-widget') && instr.includes('maal-followups'));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
