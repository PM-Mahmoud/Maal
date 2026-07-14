// lib/digest.js — PURE builder for the daily portfolio-summary digest (PR 10).
// No I/O. Turns the user's current snapshot values + snapshot history into the
// numbers the digest email renders. Deterministic-tested (test/digest.test.js).

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function round2(n) { return Math.round((num(n) + Number.EPSILON) * 100) / 100; }

// Find the snapshot closest to `daysAgo` days before the newest one, to measure
// change over a window. `history` rows: { snap_date, net_worth } oldest→newest.
function netWorthDaysAgo(history, daysAgo) {
  const rows = Array.isArray(history) ? history.filter((r) => r && r.snap_date) : [];
  if (!rows.length) return null;
  const newest = new Date(rows[rows.length - 1].snap_date).getTime();
  const target = newest - daysAgo * 86400000;
  let best = null;
  let bestDist = Infinity;
  for (const r of rows) {
    const d = Math.abs(new Date(r.snap_date).getTime() - target);
    if (d < bestDist) { bestDist = d; best = r; }
  }
  return best ? num(best.net_worth) : null;
}

// buildDigestModel({ snap, maal, snapshots, profile })
//   snap: snapshotValuesFromProfile() → { netWorth, cashBalance, ... }
//   maal: computeMaalScore() → { score, band, hasData }
//   snapshots: getSnapshots() rows (oldest→newest) for the week-over-week change
//   profile: effective profile (for monthly_expenses → cash runway)
function buildDigestModel({ snap, maal, snapshots, profile } = {}) {
  const s = snap || {};
  const netWorth = round2(s.netWorth);
  const prior = netWorthDaysAgo(snapshots, 7);
  const weekChangeAbs = prior == null ? null : round2(netWorth - prior);
  const weekChangePct = (prior == null || prior === 0) ? null : round2(((netWorth - prior) / Math.abs(prior)) * 100);

  const monthlyExpenses = num(profile && profile.monthly_expenses);
  const runwayMonths = monthlyExpenses > 0 ? round2(num(s.cashBalance) / monthlyExpenses) : null;

  const direction = weekChangeAbs == null ? 'flat' : (weekChangeAbs > 0 ? 'up' : (weekChangeAbs < 0 ? 'down' : 'flat'));

  return {
    netWorth,
    cash: round2(s.cashBalance),
    investments: round2(s.investBalance),
    superBalance: round2(s.superBalance),
    debts: round2(s.debtsTotal),
    weekChangeAbs,
    weekChangePct,
    direction,
    runwayMonths,
    score: maal && maal.hasData ? maal.score : null,
    band: maal && maal.hasData ? maal.band : null,
  };
}

module.exports = { buildDigestModel, netWorthDaysAgo };
