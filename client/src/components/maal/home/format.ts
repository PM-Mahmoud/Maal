// AUD display helpers for Home. Display-only: all arithmetic lives in
// shared/home-accounts.mjs (tested).
const whole = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function aud(n: number) {
  return whole.format(Number.isFinite(n) ? n : 0);
}
export function audCents(n: number) {
  return cents.format(Number.isFinite(n) ? n : 0);
}
/** "+$1,074.51" / "-$20.00" */
export function signedCents(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${cents.format(Math.abs(v))}`;
}
/** "$1.8K", "$900", "$1.2M" for chart axes. */
export function audCompact(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1_000_000) return `${sign}$${trim(a / 1_000_000)}M`;
  if (a >= 1_000) return `${sign}$${trim(a / 1_000)}K`;
  return `${sign}$${Math.round(a)}`;
}
function trim(x: number) {
  return x >= 100 ? Math.round(x).toString() : x.toFixed(1).replace(/\.0$/, "");
}
/** Axis tick label with enough precision that neighbouring ticks differ. */
export function audTick(n: number, span: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const [div, unit] = a >= 1_000_000 ? [1_000_000, "M"] : a >= 1_000 ? [1_000, "K"] : [1, ""];
  const s = span / div;
  const digits = div === 1 ? 0 : s >= 4 ? 0 : s >= 0.4 ? 1 : 2;
  return `${sign}$${(a / div).toFixed(digits)}${unit}`;
}
export function pctText(p: number | null) {
  return p === null ? "" : ` (${Math.abs(p).toFixed(2)}%)`;
}
export function shortDate(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}
