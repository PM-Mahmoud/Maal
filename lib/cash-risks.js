function detectCashRisks(forecast, options = {}) {
  const threshold = Number(options.threshold) || 0;
  const shortfalls = [];
  let lowest = null;
  for (const account of forecast.accounts || []) {
    for (const point of account.points || []) {
      if (!lowest || point.balance < lowest.balance) lowest = { ...point, account_reference: account.account_reference, label: account.label };
      if (point.balance < threshold && !shortfalls.some((item) => item.account_reference === account.account_reference)) {
        shortfalls.push({
          account_reference: account.account_reference, label: account.label, date: point.date,
          projected_balance: point.balance, amount_needed: Math.round((threshold - point.balance) * 100) / 100,
        });
      }
    }
  }
  const upcoming = (forecast.recurring || []).filter((item) => item.kind !== 'income' && item.nextEstimate)
    .map((item) => ({ merchant: item.merchant, kind: item.kind, date: item.nextEstimate, amount: item.averageAmount, confidence: item.confidence }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    status: shortfalls.length ? 'shortfall' : lowest && lowest.balance < threshold ? 'low_buffer' : 'clear',
    threshold, lowest_balance: lowest, shortfalls, upcoming_obligations: upcoming,
  };
}
module.exports = { detectCashRisks };
