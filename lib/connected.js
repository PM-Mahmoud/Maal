// lib/connected.js
// Folds live Basiq account balances (linked_accounts rows with a 'basiq:'
// reference) into the user's manual profile entries so the dashboard, Mizan
// Score and snapshots all see one combined picture.
//
// Policy: connected balances ADD to manual entries. If a user connects a
// bank they had also entered manually, they zero the manual field on the
// Assets page — manual fields stay authoritative for whatever isn't linked.

function aggregateConnected(accounts) {
  const sums = { cash: 0, super: 0, invest: 0, debt: 0, count: 0 };
  for (const a of accounts || []) {
    if (!String(a.account_reference || '').startsWith('basiq:')) continue;
    const bal = Number(a.balance) || 0;
    const type = String(a.institution_type || '').toLowerCase();
    sums.count++;
    if (type.includes('credit') || type.includes('loan') || type.includes('mortgage') || bal < 0) {
      sums.debt += Math.abs(bal);
    } else if (type.includes('super')) {
      sums.super += bal;
    } else if (type.includes('invest') || type === 'broker') {
      sums.invest += bal;
    } else {
      // transaction / savings / term-deposit / unknown → cash
      sums.cash += bal;
    }
  }
  return sums;
}

// Profile object with connected balances folded in — safe to hand to the
// score engine, snapshots and templates in place of the raw profile.
function buildEffectiveProfile(profile, accounts) {
  const p = profile || {};
  const c = aggregateConnected(accounts);
  if (!c.count) return { profile: p, connected: c };
  return {
    profile: {
      ...p,
      cash_savings: (Number(p.cash_savings) || 0) + c.cash,
      super_balance: (Number(p.super_balance) || 0) + c.super,
      investment_portfolio: (Number(p.investment_portfolio) || 0) + c.invest,
      total_debt: (Number(p.total_debt) || 0) + c.debt,
    },
    connected: c,
  };
}

module.exports = { aggregateConnected, buildEffectiveProfile };
