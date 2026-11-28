import { institutions } from "../../../shared/institutions.json";

/**
 * Institution registry — AU banks, brokers and super funds.
 *
 * Each entry carries a brand color (used for the monogram fallback tile) and,
 * when an official logo has been downloaded into `public/images/banks/`, the
 * local `logo` path. `textOnColor` is set only for light brand colors where
 * white monogram text would be unreadable.
 */

export interface InstitutionInfo {
  slug: string;
  name: string;
  color: string;
  textOnColor?: string;
  logo?: string;
  logoBackground?: string;
}

const BRAND_COLOURS: Record<string, { color: string; textOnColor?: string }> = {
  commbank: { color: "#FAD300", textOnColor: "#0E0E10" },
  anz: { color: "#004B87" },
  westpac: { color: "#D5002B" },
  nab: { color: "#E81E2C" },
  macquarie: { color: "#1B1B1B" },
  bendigo: { color: "#0F5EA8" },
  ing: { color: "#FF6200" },
  ubank: { color: "#19E5C1", textOnColor: "#0E0E10" },
  hsbc: { color: "#DB0011" },
  stgeorge: { color: "#0F8F4D" },
  banksa: { color: "#FFC72C", textOnColor: "#0E0E10" },
  suncorp: { color: "#FFC629", textOnColor: "#0E0E10" },
  australiansuper: { color: "#E4002B" },
  hostplus: { color: "#6E2B8A" },
  commsec: { color: "#003087" },
  selfwealth: { color: "#101828" },
  up: { color: "#FF6B35" },
};

export const INSTITUTIONS: Record<string, InstitutionInfo> = Object.fromEntries(
  institutions.map(({ slug, name, logo, logoBackground }) => {
    const brand = BRAND_COLOURS[slug];
    return [slug, { slug, name, logo, logoBackground, color: brand?.color ?? "#0E0E10", textOnColor: brand?.textOnColor }];
  }),
);

/** Normalised alias → slug. Keys must already be lowercase alphanumeric. */
const ALIASES: Record<string, string> = {
  commonwealthbank: "commbank",
  commonwealthbankofaustralia: "commbank",
  cba: "commbank",
  anzbank: "anz",
  australianandnewzealandbankinggroup: "anz",
  westpacbank: "westpac",
  westpacbankingcorporation: "westpac",
  wbc: "westpac",
  nationalaustraliabank: "nab",
  nabbank: "nab",
  macquariebank: "macquarie",
  macquariegroup: "macquarie",
  bendigobank: "bendigo",
  bendigoandadelaidebank: "bendigo",
  ingbank: "ing",
  ingdirect: "ing",
  ingaustralia: "ing",
  hsbcaustralia: "hsbc",
  hsbcbank: "hsbc",
  stgeorgebank: "stgeorge",
  suncorpbank: "suncorp",
  suncorpmetway: "suncorp",
  australiansuperannuation: "australiansuper",
  hostplussuper: "hostplus",
  commonwealthsecurities: "commsec",
  upbank: "up",
  upbanking: "up",
  bankofqueensland: "boq",
  australianretirementtrust: "art",
  greatsouthernbank: "greatsouthern",
  awaresuper: "aware",
  restsuper: "rest",
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Resolve a free-text institution name (e.g. "Commonwealth Bank", "st george",
 * "NAB") to a registry entry. Returns null when nothing matches — callers
 * should then render a neutral monogram.
 */
export function resolveInstitution(name?: string | null): InstitutionInfo | null {
  if (!name) return null;
  const key = normalize(name);
  if (!key) return null;

  // 1. Exact slug match ("westpac", "stgeorge", "australiansuper")
  const bySlug = INSTITUTIONS[key];
  if (bySlug) return bySlug;

  // 2. Alias match ("commonwealthbank" → commbank, "cba" → commbank)
  const aliasSlug = ALIASES[key];
  if (aliasSlug && INSTITUTIONS[aliasSlug]) return INSTITUTIONS[aliasSlug];

  // 3. Display-name match ("St.George" → stgeorge)
  for (const info of Object.values(INSTITUTIONS)) {
    if (normalize(info.name) === key) return info;
  }

  // 4. Prefix match for unambiguous longer slugs ("Westpac Banking Corp" →
  //    westpac). Restricted to slugs/keys ≥4 chars so short slugs like "up"
  //    can't false-positive on unrelated strings.
  for (const info of Object.values(INSTITUTIONS)) {
    if (info.slug.length < 4) continue;
    if (key.startsWith(info.slug)) return info;
    if (key.length >= 4 && normalize(info.name).startsWith(key)) return info;
  }

  return null;
}
