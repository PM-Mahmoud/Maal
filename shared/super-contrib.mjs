/**
 * Concessional-contribution capping — shared pure math.
 *
 * SINGLE SOURCE OF TRUTH for how a voluntary (salary-sacrifice) contribution is
 * clamped against the concessional cap. Used by the client Super Optimiser
 * projection and covered by test/super-contrib.test.js, so the "with extra"
 * curve can never dip below the "SG only" baseline again.
 *
 * The subtlety: when SG alone already meets or exceeds the cap, the headroom
 * (cap - sg) goes NEGATIVE. Adding that raw value to sg pulls the projected
 * contribution *below* the SG-only baseline, making extra contributions look
 * like they shrink your balance. Headroom must floor at zero.
 *
 * ESM (.mjs) so Vite can bundle it natively; the CommonJS test suite loads it
 * with dynamic import(), which works on the Node 20 used by CI.
 */

/** Remaining concessional headroom after employer SG. Never negative. */
export function remainingConcessionalCap(sgContribution, concessionalCap) {
  const sg = Number(sgContribution) || 0;
  const cap = Number(concessionalCap) || 0;
  return Math.max(0, cap - sg);
}

/**
 * Total concessional contribution once the voluntary amount is capped.
 * Always >= the SG-only baseline.
 */
export function cappedTotalContribution(sgContribution, extraContribution, concessionalCap) {
  const sg = Number(sgContribution) || 0;
  const extra = Math.max(0, Number(extraContribution) || 0);
  return sg + Math.min(extra, remainingConcessionalCap(sg, concessionalCap));
}
