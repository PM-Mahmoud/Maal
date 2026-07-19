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
}

export const INSTITUTIONS: Record<string, InstitutionInfo> = {
  commbank: { slug: "commbank", name: "CommBank", color: "#FAD300", textOnColor: "#0E0E10", logo: "/images/banks/commbank.png" },
  anz: { slug: "anz", name: "ANZ", color: "#004B87", logo: "/images/banks/anz.png" },
  westpac: { slug: "westpac", name: "Westpac", color: "#D5002B", logo: "/images/banks/westpac.png" },
  nab: { slug: "nab", name: "NAB", color: "#E81E2C", logo: "/images/banks/nab.png" },
  macquarie: { slug: "macquarie", name: "Macquarie", color: "#1B1B1B", logo: "/images/banks/macquarie.png" },
  bendigo: { slug: "bendigo", name: "Bendigo", color: "#0F5EA8", logo: "/images/banks/bendigo.png" },
  ing: { slug: "ing", name: "ING", color: "#FF6200", logo: "/images/banks/ing.png" },
  ubank: { slug: "ubank", name: "UBank", color: "#19E5C1", textOnColor: "#0E0E10", logo: "/images/banks/ubank.png" },
  hsbc: { slug: "hsbc", name: "HSBC", color: "#DB0011", logo: "/images/banks/hsbc.png" },
  stgeorge: { slug: "stgeorge", name: "St.George", color: "#0F8F4D", logo: "/images/banks/stgeorge.png" },
  banksa: { slug: "banksa", name: "BankSA", color: "#FFC72C", textOnColor: "#0E0E10", logo: "/images/banks/banksa.png" },
  suncorp: { slug: "suncorp", name: "Suncorp", color: "#FFC629", textOnColor: "#0E0E10", logo: "/images/banks/suncorp.png" },
  australiansuper: { slug: "australiansuper", name: "AustralianSuper", color: "#E4002B", logo: "/images/banks/australiansuper.png" },
  hostplus: { slug: "hostplus", name: "Hostplus", color: "#6E2B8A", logo: "/images/banks/hostplus.png" },
  commsec: { slug: "commsec", name: "CommSec", color: "#003087", logo: "/images/banks/commsec.png" },
  selfwealth: { slug: "selfwealth", name: "SelfWealth", color: "#101828", logo: "/images/banks/selfwealth.png" },
  up: { slug: "up", name: "Up", color: "#FF6B35", logo: "/images/banks/up.png" },
};

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
