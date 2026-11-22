// Client side of the Spending category colour system (shared/category-colours.mjs).
// One place every Spending view gets a category's colour from, so the same
// category is the same colour on the overview, breakdown, reports,
// transactions, transaction detail and recurring pages.
//
// Values are CSS light-dark() pairs: the v2 dark theme sets color-scheme: dark
// on :root.dark (theme-dark.css), so they switch with the theme toggle.
import { useEffect, useState, type CSSProperties } from "react";
import {
  DATA_COLOURS, categoryPair, categoryStyle, incomePair, lightDark, pairStyle, type CustomColourSource,
} from "../../../../../shared/category-colours.mjs";
import "./category-colour.css";

let customList: CustomColourSource = [];
let pending: Promise<CustomColourSource> | null = null;

/** Custom categories (with their stored colour) from GET /api/v1/transaction-categories, fetched once. */
export function loadCustomColours(): Promise<CustomColourSource> {
  if (!pending) {
    pending = fetch("/api/v1/transaction-categories", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { groups: [] }))
      .then((d: { groups?: CustomColourSource }) => {
        customList = (d.groups || []).filter((g) => g && g.custom);
        return customList;
      })
      .catch(() => customList);
  }
  return pending;
}

/** Hand the colour system a fresh custom list (e.g. after creating a category). */
export function setCustomColours(list: CustomColourSource) {
  customList = list.filter((g) => g && g.custom !== false);
  pending = Promise.resolve(customList);
}

/** Loads custom category colours once and re-renders when they arrive. */
export function useCustomColours(): CustomColourSource {
  const [list, setList] = useState(customList);
  useEffect(() => {
    let live = true;
    loadCustomColours().then((l) => { if (live) setList(l); });
    return () => { live = false; };
  }, []);
  return list;
}

/** Mark colour for a category (fills, strokes, dots). */
export function catColour(name: string | null | undefined, custom?: CustomColourSource | null): string {
  return lightDark(categoryPair(name, custom ?? customList));
}

/** Colour for an income source (stays in the green/teal family). */
export function incomeColour(name: string | null | undefined, custom?: CustomColourSource | null): string {
  return lightDark(incomePair(name, custom ?? customList));
}

/** Inline vars --cat / --cat-tint / --cat-ink for a category's icon chip, dot or bar. */
export function catVars(name: string | null | undefined, custom?: CustomColourSource | null): CSSProperties {
  return categoryStyle(name, custom ?? customList) as CSSProperties;
}

/** Vars for an income source's chip/bar (green/teal family). */
export function incomeVars(name: string | null | undefined, custom?: CustomColourSource | null): CSSProperties {
  return pairStyle(incomePair(name, custom ?? customList)) as CSSProperties;
}

/** Vars for a data role (e.g. the neutral fold bucket). */
export function dataVars(role: keyof typeof DATA_COLOURS): CSSProperties {
  return pairStyle(DATA_COLOURS[role]) as CSSProperties;
}

/** Data roles that are not categories. */
export function dataColour(role: keyof typeof DATA_COLOURS): string {
  return lightDark(DATA_COLOURS[role]);
}
