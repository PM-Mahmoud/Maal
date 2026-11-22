// shared/category-colours.mjs — the one category colour system for Spending
// (overview, breakdown, reports, transactions, transaction detail, recurring).
// Pure: no DOM, no I/O. test/category-colours.test.js covers the mapping, the
// fallback and custom-colour precedence.
//
// Colour is presentation only. Buttons, text and UI chrome stay monochrome;
// category and data charts use these values (CLAUDE.md design system).
//
// Each of the 18 built-in groups (lib/transaction-categories.js) has a light
// and a dark value. Both sets were checked with the dataviz validator:
//   light, on #FFFFFF: every value in OKLCH L 0.43–0.77, chroma >= 0.10;
//     16 of 18 >= 3:1. Bills & Utilities (2.64) and Children (2.63) sit in
//     the relief band, so they never carry meaning alone: every chart that
//     uses them also shows a legend or a labelled row.
//   dark, on #101010: every value in L 0.48–0.67, chroma >= 0.10, all >= 3:1.
//   Transfers is the one intentional neutral (slate, chroma ~0.03).
// Eighteen hues cannot all be pairwise distinct at the validator's 15 ΔE
// floor (it caps all-pairs forms at about three series), so every category
// visual also carries a name, an icon or a legend, and fills are separated by
// 2px surface gaps. Colour is never the only cue.

/** group -> [light, dark]. Order follows lib/transaction-categories.js. */
export const CATEGORY_PALETTE = Object.freeze({
  "Income": ["#16A958", "#26A653"],
  "Credit Card Payments": ["#614DBA", "#7563D4"],
  "Transfers": ["#6B7786", "#7D8899"],
  "Financial": ["#1F4FA8", "#5068BE"],
  "Savings & Investments": ["#0A8C6E", "#109A7D"],
  "Housing": ["#1476D3", "#2F7FE0"],
  "Bills & Utilities": ["#C89809", "#B98C0C"],
  "Food & Dining": ["#D35F12", "#D76A1C"],
  "Health & Wellness": ["#CE4D72", "#D6587D"],
  "Auto & Transport": ["#2699F3", "#4C93EC"],
  "Shopping": ["#B5509F", "#BF5DAB"],
  "Travel & Lifestyle": ["#009DB5", "#0FA6B0"],
  "Education": ["#9759C3", "#A06BD3"],
  "Children": ["#FB795B", "#DA6C62"],
  "Recurring & Subscriptions": ["#7A2E92", "#9550B0"],
  "Business": ["#94571A", "#A9692C"],
  "Gifts & Donations": ["#C2413D", "#CF4F49"],
  "Other": ["#74891A", "#7D9224"],
});

export const CATEGORY_GROUPS = Object.freeze(Object.keys(CATEGORY_PALETTE));

/** Data roles that are not a category: income vs expense bars, net months. */
export const DATA_COLOURS = Object.freeze({
  income: CATEGORY_PALETTE["Income"],
  expense: CATEGORY_PALETTE["Food & Dining"],
  positive: CATEGORY_PALETTE["Income"],
  negative: ["#D14343", "#E5625F"],
  neutral: CATEGORY_PALETTE["Transfers"],
});

/** Surfaces the tints are mixed against (v2 card colours). */
export const SURFACES = Object.freeze({ light: "#FFFFFF", dark: "#101010" });

const HEX = /^#[0-9a-f]{6}$/i;
const norm = (h) => (typeof h === "string" && HEX.test(h.trim()) ? h.trim().toUpperCase() : null);
const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb) => "#" + rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("").toUpperCase();

/** Mix `a` toward `b`: amount 0 = a, 1 = b. sRGB, deterministic. */
export function mix(a, b, amount) {
  const x = toRgb(a), y = toRgb(b);
  return toHex(x.map((c, i) => c + (y[i] - c) * amount));
}

const lum = (h) => {
  const [r, g, b] = toRgb(h).map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG 2 contrast ratio. */
export function contrast(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/** Soft background for icon chips and progress-bar tracks. */
export function tintOf(colour, mode = "light") {
  return mode === "dark" ? mix(colour, SURFACES.dark, 0.74) : mix(colour, SURFACES.light, 0.86);
}

/** A shade of `colour` readable as text/glyph on its own tint (>= 4.5:1). */
export function inkOf(colour, mode = "light") {
  const tint = tintOf(colour, mode);
  const toward = mode === "dark" ? "#FFFFFF" : "#000000";
  for (let k = 0; k <= 20; k++) {
    const c = mix(colour, toward, k * 0.05);
    if (contrast(c, tint) >= 4.5) return c;
  }
  return toward;
}

/** Stable 32-bit FNV-1a hash of a string (never random). */
export function hashName(name) {
  let h = 0x811c9dc5;
  const s = String(name ?? "").trim().toLowerCase();
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

// Fallback hues for unknown names: the palette minus the neutral Transfers
// slate and Income green (so an unknown name never reads as money in).
const FALLBACK = CATEGORY_GROUPS.filter((g) => g !== "Transfers" && g !== "Income").map((g) => CATEGORY_PALETTE[g]);

const BY_LIGHT = new Map(Object.values(CATEGORY_PALETTE).map(([l, d]) => [l, d]));

/**
 * Light/dark pair for a category name.
 * Precedence: a custom category's stored colour > built-in group > hash fallback.
 * `custom` is the GET /v1/transaction-categories list (items with custom:true
 * carry `group` + `color`) or any [{ name, color }]. A stored colour that matches a
 * palette light value takes that entry's dark step; any other stored colour is
 * used in both modes.
 */
export function categoryPair(name, custom) {
  const key = String(name ?? "").trim();
  if (Array.isArray(custom) && key) {
    const lower = key.toLowerCase();
    const c = custom.find((x) => x && x.custom !== false && String(x.name ?? x.group ?? "").trim().toLowerCase() === lower && norm(x.color ?? x.colour));
    if (c) {
      const stored = norm(c.color ?? c.colour);
      return [stored, BY_LIGHT.get(stored) ?? stored];
    }
  }
  if (Object.prototype.hasOwnProperty.call(CATEGORY_PALETTE, key)) return CATEGORY_PALETTE[key];
  const ci = CATEGORY_GROUPS.find((g) => g.toLowerCase() === key.toLowerCase());
  if (ci) return CATEGORY_PALETTE[ci];
  return FALLBACK[hashName(key) % FALLBACK.length];
}

// Income sources (Salary & wages, Interest, a custom income category…) stay in
// the positive green/teal/cyan family so money in always reads as money in.
const INCOME_FAMILY = ["Income", "Savings & Investments", "Travel & Lifestyle", "Auto & Transport", "Other"].map((g) => CATEGORY_PALETTE[g]);

/** Light/dark pair for an income source. Custom colour wins; built-in groups keep theirs. */
export function incomePair(name, custom) {
  const key = String(name ?? "").trim();
  const mapped = categoryPair(key, custom);
  const isCustom = Array.isArray(custom) && custom.some((x) => x && x.custom !== false && String(x.name ?? x.group ?? "").trim().toLowerCase() === key.toLowerCase() && norm(x.color ?? x.colour));
  if (isCustom || CATEGORY_GROUPS.some((g) => g.toLowerCase() === key.toLowerCase())) return mapped;
  if (/salary|wage|pay/i.test(key)) return CATEGORY_PALETTE["Income"];
  return INCOME_FAMILY[hashName(key) % INCOME_FAMILY.length];
}

/** Every value a view needs for one category, both modes. */
export function categoryColours(name, custom) {
  const [light, dark] = categoryPair(name, custom);
  return {
    light, dark,
    tintLight: tintOf(light, "light"), tintDark: tintOf(dark, "dark"),
    inkLight: inkOf(light, "light"), inkDark: inkOf(dark, "dark"),
  };
}

/** CSS value that follows the page theme (needs color-scheme: dark in dark mode). */
export const lightDark = (pair) => `light-dark(${pair[0]}, ${pair[1]})`;

/**
 * Inline CSS custom properties for a category: --cat (mark colour),
 * --cat-tint (icon chip / track) and --cat-ink (glyph/text on the tint).
 */
export function categoryStyle(name, custom) {
  return pairStyle(categoryPair(name, custom));
}

/** Same vars for any light/dark pair (e.g. an income source's incomePair()). */
export function pairStyle([light, dark]) {
  const c = {
    light, dark,
    tintLight: tintOf(light, "light"), tintDark: tintOf(dark, "dark"),
    inkLight: inkOf(light, "light"), inkDark: inkOf(dark, "dark"),
  };
  return {
    "--cat": `light-dark(${c.light}, ${c.dark})`,
    "--cat-tint": `light-dark(${c.tintLight}, ${c.tintDark})`,
    "--cat-ink": `light-dark(${c.inkLight}, ${c.inkDark})`,
  };
}

/** Swatches offered when a user creates a category or group. */
export const PICKER_COLOURS = Object.freeze([
  ...CATEGORY_GROUPS.filter((g) => g !== "Transfers").map((g) => CATEGORY_PALETTE[g][0]),
  "#6B7786", "#121313", "#8A8C88",
]);
