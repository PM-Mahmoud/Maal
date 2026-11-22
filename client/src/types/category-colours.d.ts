// Types for shared/category-colours.mjs (Spending category colour system).
declare module "*category-colours.mjs" {
  export type Pair = readonly [light: string, dark: string];
  export type CustomColourSource = Array<{ name?: string; group?: string; color?: string; colour?: string; custom?: boolean }>;
  export type CategoryColours = { light: string; dark: string; tintLight: string; tintDark: string; inkLight: string; inkDark: string };

  export const CATEGORY_PALETTE: Readonly<Record<string, Pair>>;
  export const CATEGORY_GROUPS: readonly string[];
  export const DATA_COLOURS: Readonly<{ income: Pair; expense: Pair; positive: Pair; negative: Pair; neutral: Pair }>;
  export const SURFACES: Readonly<{ light: string; dark: string }>;
  export const PICKER_COLOURS: readonly string[];
  export function mix(a: string, b: string, amount: number): string;
  export function contrast(a: string, b: string): number;
  export function tintOf(colour: string, mode?: "light" | "dark"): string;
  export function inkOf(colour: string, mode?: "light" | "dark"): string;
  export function hashName(name: string | null | undefined): number;
  export function categoryPair(name: string | null | undefined, custom?: CustomColourSource | null): Pair;
  export function incomePair(name: string | null | undefined, custom?: CustomColourSource | null): Pair;
  export function categoryColours(name: string | null | undefined, custom?: CustomColourSource | null): CategoryColours;
  export function lightDark(pair: Pair): string;
  export function pairStyle(pair: Pair): Record<"--cat" | "--cat-tint" | "--cat-ink", string>;
  export function categoryStyle(name: string | null | undefined, custom?: CustomColourSource | null): Record<"--cat" | "--cat-tint" | "--cat-ink", string>;
}
