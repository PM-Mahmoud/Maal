function money(value) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);
}

function explainSnapshotChange(previous, current, options = {}) {
  const number = (row, key) => Number(row?.[key]) || 0;
  const netChange = Math.round((number(current, 'net_worth') - number(previous, 'net_worth')) * 100) / 100;
  const threshold = options.threshold ?? Math.max(100, Math.abs(number(previous, 'net_worth')) * 0.01);
  const component = (key) => number(current, key) - number(previous, key);
  const superImpact = component('super_balance');
  const investmentImpact = component('invest_balance');
  const cashImpact = component('cash_balance');
  const debtImpact = number(previous, 'debts_total') - number(current, 'debts_total');
  const otherAssetsImpact = component('assets_total') - superImpact - investmentImpact - cashImpact;
  const contributors = [
    { category: 'investments', impact: investmentImpact },
    { category: 'debt', impact: debtImpact },
    { category: 'super', impact: superImpact },
    { category: 'other assets', impact: otherAssetsImpact },
    { category: 'cash', impact: cashImpact },
  ].filter((item) => Math.abs(item.impact) >= threshold)
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  const material = Math.abs(netChange) >= threshold;
  if (!material) return { material: false, net_change: netChange, threshold, contributors: [], summary: null };
  const label = (item) => item.category === 'debt'
    ? (item.impact >= 0 ? 'lower debt' : 'higher debt') : item.category;
  const drivers = contributors.slice(0, 2).map(label);
  const joined = drivers.length === 2 ? `${drivers[0]} and ${drivers[1]}` : drivers[0];
  const direction = netChange >= 0 ? 'increased' : 'decreased';
  return {
    material: true, net_change: netChange, threshold, contributors,
    summary: `Net worth ${direction} by ${money(Math.abs(netChange))}${joined ? `, mainly from ${joined}` : ''}.`,
  };
}

function explainSnapshotSeries(rows) {
  return (rows || []).map((row, index) => ({
    ...row,
    change: index === 0 ? null : explainSnapshotChange(rows[index - 1], row),
  }));
}

module.exports = { explainSnapshotChange, explainSnapshotSeries };
