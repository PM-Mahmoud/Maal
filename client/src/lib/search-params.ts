// Tiny search-param validators for route `validateSearch`.
//
// validateSearch is part of the route's critical config, so TanStack Router
// keeps it in the MAIN bundle even with auto code-splitting. Using zod here put
// all of zod (~53 kB minified) on every first page load, the landing page
// included, for four one-line schemas. These helpers keep the same semantics as
// the zod schemas they replaced: unknown keys are stripped, absent keys stay
// absent, and a present-but-invalid value throws (the route's error boundary).

type Check = (value: unknown, key: string) => unknown;

function invalid(key: string): never {
  throw new Error(`Invalid search param: ${key}`);
}

/** Optional value that must be one of `allowed`. */
export function optEnum<const T extends readonly string[]>(allowed: T) {
  return ((value: unknown, key: string) => {
    if (value === undefined) return undefined;
    if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value;
    return invalid(key);
  }) as (value: unknown, key: string) => T[number] | undefined;
}

/** Optional string, with an optional maximum length. */
export function optString(max = Infinity) {
  return ((value: unknown, key: string) => {
    if (value === undefined) return undefined;
    if (typeof value === "string" && value.length <= max) return value;
    return invalid(key);
  }) as (value: unknown, key: string) => string | undefined;
}

/** Optional string | number | boolean (flags such as ?demo=1). */
export function optScalar() {
  return ((value: unknown, key: string) => {
    if (value === undefined) return undefined;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    return invalid(key);
  }) as (value: unknown, key: string) => string | number | boolean | undefined;
}

type Shape = Record<string, Check>;
type Parsed<S extends Shape> = { [K in keyof S]?: Exclude<ReturnType<S[K]>, undefined> };

/** Build a validateSearch function from a shape of checks. */
export function searchSchema<S extends Shape>(shape: S) {
  return (search: Record<string, unknown>): Parsed<S> => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) {
      const v = shape[key](search[key], key);
      if (v !== undefined) out[key] = v;
    }
    return out as Parsed<S>;
  };
}
