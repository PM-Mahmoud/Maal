const CADENCE_DAYS = { weekly: 7, fortnightly: 14 };
function iso(date) { return date.toISOString().slice(0, 10); }
function advance(date, cadence, anchor) {
  const next = new Date(date);
  if (CADENCE_DAYS[cadence]) next.setUTCDate(next.getUTCDate() + CADENCE_DAYS[cadence]);
  else if (cadence === 'monthly') {
    next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(Math.min(anchor.day, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()));
  } else if (cadence === 'yearly') {
    next.setUTCDate(1); next.setUTCFullYear(next.getUTCFullYear() + 1); next.setUTCMonth(anchor.month);
    next.setUTCDate(Math.min(anchor.day, new Date(Date.UTC(next.getUTCFullYear(), anchor.month + 1, 0)).getUTCDate()));
  } else return null;
  return next;
}

function forecastAccountBalances({ accounts, recurring, startDate, days = 90 }) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const accountRows = (accounts || []).map((account) => ({
    account_reference: account.account_reference || `account:${account.id}`,
    label: account.label || account.account_reference || 'Cash account',
    opening_balance: Number(account.balance) || 0,
  }));
  if (!accountRows.length) return { start_date: startDate, days, accounts: [] };
  const primary = accountRows[0].account_reference;
  const events = new Map();
  for (const item of recurring || []) {
    let date = item.nextEstimate ? new Date(`${item.nextEstimate}T00:00:00Z`) : null;
    if (!date || Number.isNaN(date.getTime())) continue;
    const anchor = { day: date.getUTCDate(), month: date.getUTCMonth() };
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + days);
    while (date < start) { date = advance(date, item.cadence, anchor); if (!date) break; }
    if (!date) continue;
    while (date <= end) {
      const key = `${item.account_reference || primary}|${iso(date)}`;
      const direction = item.kind === 'income' ? 1 : -1;
      events.set(key, (events.get(key) || 0) + direction * Math.abs(Number(item.averageAmount) || 0));
      date = advance(date, item.cadence, anchor); if (!date) break;
    }
  }
  return {
    start_date: startDate, days,
    accounts: accountRows.map((account) => {
      let balance = account.opening_balance;
      const points = [];
      for (let offset = 0; offset <= days; offset++) {
        const date = new Date(start); date.setUTCDate(date.getUTCDate() + offset);
        balance += events.get(`${account.account_reference}|${iso(date)}`) || 0;
        points.push({ date: iso(date), balance: Math.round(balance * 100) / 100 });
      }
      return { ...account, closing_balance: points.at(-1).balance, points };
    }),
  };
}
module.exports = { forecastAccountBalances };
