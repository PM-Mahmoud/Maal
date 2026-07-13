// lib/goal-progress.js — PURE derivation of a goal's live progress.
//
// PR 7 turns goals from static numbers the user types into figures DERIVED from
// their real financials. This module is deliberately pure (no DB, no I/O) so the
// money math is covered by deterministic tests (test/goal-progress.test.js) per
// the repo's financial-calculation rule.
//
// A goal points at one aggregate `source` of the user's live position:
//   net_worth | cash | super | investments | debts   (or 'manual' = no source)
// Live source values come from db/snapshots.snapshotValuesFromProfile(), i.e.
// { netWorth, cash, super, investments, debts }.
//
// Target can be an absolute dollar amount OR a percentage of the source's
// baseline value (captured at creation) — matching the goals UI's "% of Source"
// control: a percent target is `baseline * pct/100` (e.g. 50% of Source, or 120%
// to mean "grow to 1.2× today").

const SOURCE_KEYS = {
  net_worth: 'netWorth',
  cash: 'cash',
  super: 'super',
  investments: 'investments',
  debts: 'debts',
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round((num(n) + Number.EPSILON) * 100) / 100;
}

// Live value of an aggregate source. Debts come back as a positive magnitude
// (what you owe), matching snapshotValuesFromProfile's debtsTotal.
function liveSourceValue(sourceType, financials) {
  const key = SOURCE_KEYS[sourceType];
  if (!key) return 0;
  return Math.max(0, num(financials && financials[key]));
}

function finalize(current, target) {
  const c = Math.max(0, num(current));
  const t = Math.max(0, num(target));
  const pct = t > 0 ? Math.min(100, Math.max(0, Math.round((c / t) * 100))) : 0;
  return {
    current_amount: round2(c),
    target_amount: round2(t),
    pct,
    reached: t > 0 && c >= t,
  };
}

// Resolve the target dollar figure for a goal given its baseline source value.
function resolveTarget(goal, baseline) {
  if ((goal.target_kind || 'amount') === 'percent') {
    return Math.max(0, baseline * (num(goal.target_pct) / 100));
  }
  return Math.max(0, num(goal.target_amount));
}

// deriveGoalProgress(goal, financials) -> { current_amount, target_amount, pct, reached }
//
// goal: { source_type, target_kind, target_amount, target_pct, baseline_amount,
//         current_amount }  (current_amount is the manual fallback)
// financials: { netWorth, cash, super, investments, debts }
function deriveGoalProgress(goal, financials) {
  const g = goal || {};
  const sourceType = g.source_type || 'manual';
  const baseline = num(g.baseline_amount);

  // MANUAL — no live source; the user maintains current_amount by hand.
  if (sourceType === 'manual' || !SOURCE_KEYS[sourceType]) {
    return finalize(num(g.current_amount), Math.max(0, num(g.target_amount)));
  }

  const live = liveSourceValue(sourceType, financials);

  // PAY OFF (debts) — progress is how much of the baseline debt is cleared, so it
  // rises as the live debt falls. Target is the amount you intend to pay down
  // (default: the whole baseline; or pct% of it).
  if (sourceType === 'debts') {
    const target = resolveTarget(g, baseline) || (g.target_kind === 'percent' ? 0 : baseline);
    const cleared = Math.max(0, baseline - live); // paid down since creation
    return finalize(Math.min(cleared, target || cleared), target);
  }

  // GROW / SAVE / INVEST (net_worth/cash/super/investments) — current is the live
  // source value; target is an absolute $ or a % of the baseline.
  return finalize(live, resolveTarget(g, baseline));
}

// Which aggregate source a goal category defaults to (used when the client sends
// a category but not an explicit source_type — keeps old create payloads working).
function defaultSourceForCategory(category) {
  switch (category) {
    case 'debt': return 'debts';
    case 'retirement': return 'super';
    case 'invest': return 'investments';
    case 'emergency':
    case 'home':
    case 'education':
    case 'travel': return 'cash';
    default: return 'manual';
  }
}

module.exports = {
  deriveGoalProgress,
  defaultSourceForCategory,
  liveSourceValue,
  SOURCE_KEYS,
};
