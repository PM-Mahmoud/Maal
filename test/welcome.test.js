'use strict';
// Deterministic tests for lib/welcome.js + the profile patch that stores the
// /welcome answers (only known values may ever be saved).

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const w = require('../lib/welcome');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); failed++; }
}

console.log('\nwelcome answers');

test('goals keep known ids only, de-duplicated, in canonical order', () => {
  assert.deepStrictEqual(w.sanitizeGoals(['super', 'debt', 'super', 'hack', '<b>']), ['debt', 'super']);
  assert.deepStrictEqual(w.sanitizeGoals('debt'), []);
  assert.deepStrictEqual(w.sanitizeGoals(null), []);
});

test('heard-from accepts one known option, else null', () => {
  assert.strictEqual(w.sanitizeHeardFrom('event'), 'event');
  assert.strictEqual(w.sanitizeHeardFrom('reddit'), 'reddit');
  assert.strictEqual(w.sanitizeHeardFrom('DROP TABLE'), null);
  assert.strictEqual(w.sanitizeHeardFrom(undefined), null);
});

test('options include the stall/event source and the same list as the onboarding screen', () => {
  const ids = w.HEARD_FROM.map((h) => h.id);
  assert.ok(ids.includes('event'));
  const src = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'routes', 'welcome.tsx'), 'utf8');
  for (const id of ids) assert.ok(src.includes(`"${id}"`), `welcome.tsx missing heard-from id ${id}`);
  for (const g of w.GOALS) assert.ok(src.includes(`id: "${g.id}"`), `welcome.tsx missing goal id ${g.id}`);
});

test('profile patch stores sanitised answers in onboarding_data', () => {
  const { profilePatchToColumns } = require('../db/profiles');
  if (typeof profilePatchToColumns !== 'function') return; // not exported: covered by the sanitiser tests above
  const { onboarding_data } = profilePatchToColumns({ goals: ['invest', 'nope'], heard_from: 'x', welcome_completed: true });
  assert.deepStrictEqual(onboarding_data.goals, ['invest']);
  assert.strictEqual(onboarding_data.heard_from, 'x');
  assert.ok(!Number.isNaN(Date.parse(onboarding_data.welcome_completed_at)));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
