'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { scoreDebtRatio, scoreSavingsRate, scoreInsurance } = require('../lib/score-engine');

test('consumer debt score includes both HELP and other debt at band edges', () => {
  assert.equal(scoreDebtRatio(100000, 8000, 2000), 20);
  assert.equal(scoreDebtRatio(100000, 15000, 5000), 14);
  assert.equal(scoreDebtRatio(100000, 15000, 15000), 8);
  assert.equal(scoreDebtRatio(100000, 30000, 20000), 2);
});

test('savings points use monthly gross income and cap at 15 points', () => {
  assert.equal(scoreSavingsRate(120000, -100), 0);
  assert.equal(scoreSavingsRate(120000, 500), 3);
  assert.equal(scoreSavingsRate(120000, 1000), 7);
  assert.equal(scoreSavingsRate(120000, 2000), 15);
  assert.equal(scoreSavingsRate(120000, 3000), 15);
});

test('insurance scoring handles each supported coverage level', () => {
  assert.equal(scoreInsurance('full'), 10);
  assert.equal(scoreInsurance('partial'), 5);
  assert.equal(scoreInsurance('none'), 0);
});
