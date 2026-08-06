function buildMonthlyClose(month, inputs) {
  const snapshots = inputs.snapshots || [];
  const opening = snapshots[0] || null;
  const closing = snapshots.at(-1) || null;
  const openingWorth = Number(opening?.net_worth) || 0;
  const closingWorth = Number(closing?.net_worth) || 0;
  let moneyIn = 0; let moneyOut = 0;
  for (const row of inputs.transactions || []) {
    const amount = Number(row.amount) || 0;
    if (amount >= 0) moneyIn += amount; else moneyOut += Math.abs(amount);
  }
  return {
    month,
    net_worth: { opening: openingWorth, closing: closingWorth, change: Math.round((closingWorth - openingWorth) * 100) / 100 },
    cash_flow: { money_in: Math.round(moneyIn * 100) / 100, money_out: Math.round(moneyOut * 100) / 100, net: Math.round((moneyIn - moneyOut) * 100) / 100 },
    investment_performance: inputs.investmentPerformance || null,
    reconciliation_exceptions: (inputs.reconciliations || []).filter((row) => row.status !== 'matched').length,
    snapshot_count: snapshots.length,
    transaction_count: (inputs.transactions || []).length,
  };
}
module.exports = { buildMonthlyClose };
