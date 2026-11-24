'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { estimateTax } = require('../lib/tax');

const years = [
  { label: '2025-26', date: new Date(2026, 5, 30), taxAt45k: 4288, hecsStart: 67000, hecsMiddle: 125000, hecsTop: 179286, middlePayment: 8700 },
  { label: '2026-27', date: new Date(2026, 6, 1), taxAt45k: 4020, hecsStart: 69528, hecsMiddle: 129717, hecsTop: 186050, middlePayment: 9028 },
];

for (const year of years) {
  test(`${year.label} income tax edges and Medicare phase-in`, (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: year.date });
    const tax = (annual_income) => estimateTax({ annual_income });
    assert.deepEqual(tax(0), { hasData: false });
    assert.equal(tax(18200).incomeTax, 0);
    // At $45k the taxable part is $26,800 at 16% or 15% (ATO resident rates).
    assert.equal(tax(45000).incomeTax, year.taxAt45k);
    assert.equal(tax(45010).incomeTax, year.taxAt45k + 3);
    // The next $90,000 is taxed at 30%, then $55,000 at 37%.
    assert.equal(tax(135000).incomeTax, year.taxAt45k + 27000);
    assert.equal(tax(190000).incomeTax, year.taxAt45k + 47350);
    assert.equal(tax(190100).incomeTax, year.taxAt45k + 47395);
    // Repo single-person Medicare thresholds: 10% of the first $1,000
    // above $28,011 is $100. At $36,000 the full 2% is $720.
    assert.equal(tax(28011).medicare, 0);
    assert.equal(tax(29011).medicare, 100);
    assert.equal(tax(36000).medicare, 720);
    assert.equal(tax(45000).takeHome, 45000 - year.taxAt45k - 900);
  });

  test(`${year.label} marginal HELP repayments and balance cap`, (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: year.date });
    const repayment = (annual_income, hecs_balance = 50000) => estimateTax({ annual_income, hecs_balance }).hecs;
    assert.equal(repayment(year.hecsStart), 0);
    // $100 above the lower threshold at 15c per dollar = $15.
    assert.equal(repayment(year.hecsStart + 100), 15);
    assert.equal(repayment(year.hecsStart + 100, 9), 9);
    assert.equal(repayment(year.hecsStart + 100, 0), 0);
    // At the second threshold: $58,000 × 15% = $8,700 in FY25/26,
    // or $60,189 × 15% = $9,028.35 in FY26/27, rounded to $9,028.
    assert.equal(repayment(year.hecsMiddle), year.middlePayment);
    assert.equal(repayment(year.hecsMiddle + 100), year.middlePayment + 17);
    // In the top band, take 10% of the full repayment income.
    assert.equal(repayment(year.hecsTop + 10), Math.round((year.hecsTop + 10) * 0.10));
  });
}
