// App navigation (2026-11-15): Track · Services · Calculators · Account.
// Each Track area groups the existing pages that belong to it; the shell shows
// those pages as tabs at the top of the content (SectionTabs).

export type SubPage = { to: string; label: string };
export type Area = { key: string; label: string; to: string; pages: SubPage[] };

export const TRACK: Area[] = [
  { key: "home", label: "Home", to: "/app", pages: [] },
  {
    key: "spending", label: "Spending", to: "/app/transactions",
    pages: [
      { to: "/app/transactions", label: "Transactions" },
      { to: "/app/wealth/cash", label: "Cash" },
      { to: "/app/wealth/liabilities", label: "Debts" },
    ],
  },
  {
    key: "invest", label: "Invest", to: "/app/invest",
    pages: [
      { to: "/app/invest", label: "Overview" },
      { to: "/app/wealth/investments", label: "Investments" },
      { to: "/app/wealth/super", label: "Super" },
      { to: "/app/wealth/property", label: "Property" },
      { to: "/app/wealth/other", label: "Other assets" },
      { to: "/app/assets", label: "Net worth" },
      { to: "/app/portfolio-plan", label: "Portfolio plan" },
      { to: "/app/research", label: "Research" },
      { to: "/app/radar", label: "Radar" },
    ],
  },
  {
    key: "forecast", label: "Forecast", to: "/app/retirement",
    pages: [
      { to: "/app/retirement", label: "Retirement" },
      { to: "/app/planning", label: "Financial plan" },
      { to: "/app/goals", label: "Goals" },
      { to: "/app/action-plan", label: "Action plan" },
      { to: "/app/net-worth-flow", label: "Net worth flow" },
      { to: "/app/report", label: "Report" },
    ],
  },
  { key: "equity", label: "Equity", to: "/app/equity", pages: [] },
];

export const SERVICES: SubPage[] = [
  { to: "/app/services/brokerage", label: "Brokerage" },
  { to: "/app/services/estate-planning", label: "Estate planning" },
  { to: "/app/services/tax", label: "Tax" },
  { to: "/app/services/financial-planner", label: "Financial planner" },
];

export const CALCULATORS: SubPage[] = [{ to: "/app/zakat", label: "Zakat" }];

export const ACCOUNT: SubPage[] = [
  { to: "/app/vault", label: "Vault" },
  { to: "/app/onboarding", label: "Profile" },
  { to: "/app/billing", label: "Plan & Usage" },
  { to: "/app/roadmap", label: "Roadmap" },
];

const matches = (path: string, to: string) =>
  to === "/app" ? path === "/app" || path === "/app/" : path === to || path.startsWith(to + "/");

/** The Track area a path belongs to (null outside Track). */
export function areaFor(path: string): Area | null {
  for (const a of TRACK) {
    if (a.key === "home") { if (matches(path, "/app")) return a; continue; }
    if (matches(path, a.to) || a.pages.some((p) => matches(path, p.to))) return a;
  }
  return null;
}

export const isActivePath = matches;
