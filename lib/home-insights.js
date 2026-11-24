'use strict';

const { getConstants } = require('./au-constants');
const { calculateCashRunway } = require('./spending-cashflow');
const { estimateTax } = require('./tax');

const AU_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Home figures from the stored financial profile and effective 30-day spending. */
function buildHomeInsights({ profile, hasCash, transactions, date = new Date() }) {
  const dateKey = AU_DAY.format(date);
  const tax = estimateTax(profile, dateKey);
  const runway = hasCash ? calculateCashRunway(transactions, profile.cash_savings, null).months : null;
  return {
    cashRunwayMonths: runway == null ? null : Math.max(0, runway),
    taxImpact: { fiscalYear: getConstants(dateKey).fy, total: tax.hasData ? tax.total : null },
  };
}

module.exports = { buildHomeInsights };
