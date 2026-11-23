// Display-only date labels for report periods (en-AU). Maths lives in
// shared/spending-reports.mjs.
import type { Interval, Period } from "../../../../../../shared/spending-reports.mjs";

export const dayOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** "1 Oct 2025 – 2 Mar 2026" */
export function rangeText(from: string, to: string) {
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return `${dayOf(from).toLocaleDateString("en-AU", o)} – ${dayOf(to).toLocaleDateString("en-AU", o)}`;
}

const QUARTERS = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"];

/** Short x-axis label. Months show a 2-digit year on the first bar and each January when the range crosses years. */
export function shortLabel(p: Period, interval: Interval, i: number, crossYear: boolean) {
  const d = dayOf(p.key);
  if (interval === "week") return dayOf(p.start).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  if (interval === "quarter") return `${QUARTERS[Math.floor(d.getMonth() / 3)]} ${String(d.getFullYear()).slice(2)}`;
  const withYear = crossYear && (i === 0 || d.getMonth() === 0);
  return withYear
    ? `${d.toLocaleDateString("en-AU", { month: "short" })} ’${String(d.getFullYear()).slice(2)}`
    : d.toLocaleDateString("en-AU", { month: "short" });
}

/** Table row label: "March 2026" (or "March" in the current year), "Week of 4 Nov", "Jul–Sep 2026". */
export function longLabel(p: Period, interval: Interval, today: Date) {
  const d = dayOf(p.key);
  const sameYear = d.getFullYear() === today.getFullYear();
  if (interval === "week") {
    return `Week of ${dayOf(p.start).toLocaleDateString("en-AU", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" })}`;
  }
  if (interval === "quarter") return `${QUARTERS[Math.floor(d.getMonth() / 3)]} ${d.getFullYear()}`;
  return d.toLocaleDateString("en-AU", sameYear ? { month: "long" } : { month: "long", year: "numeric" });
}

export const PER: Record<Interval, string> = { week: "wk", month: "mo", quarter: "qtr" };
export const PERIOD_NOUN: Record<Interval, string> = { week: "Week", month: "Month", quarter: "Quarter" };
