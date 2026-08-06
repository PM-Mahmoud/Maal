function calculateModifiedDietz({ openingValue, closingValue, cashFlows, startDate, endDate }) {
  const opening = Number(openingValue);
  const closing = Number(closingValue);
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  if (![opening, closing, start, end].every(Number.isFinite) || end <= start) {
    return { return_pct: null, investment_gain: null, net_contributions: 0 };
  }
  const duration = end - start;
  let netContributions = 0;
  let weightedFlows = 0;
  for (const flow of cashFlows || []) {
    const amount = Number(flow.amount);
    const occurred = new Date(`${String(flow.occurred_on).slice(0, 10)}T00:00:00Z`).getTime();
    if (!Number.isFinite(amount) || !Number.isFinite(occurred) || occurred < start || occurred > end) continue;
    netContributions += amount;
    weightedFlows += amount * ((end - occurred) / duration);
  }
  const gain = closing - opening - netContributions;
  const denominator = opening + weightedFlows;
  return {
    return_pct: denominator > 0 ? Math.round((gain / denominator) * 10000) / 100 : null,
    investment_gain: Math.round(gain * 100) / 100,
    net_contributions: Math.round(netContributions * 100) / 100,
  };
}

module.exports = { calculateModifiedDietz };
