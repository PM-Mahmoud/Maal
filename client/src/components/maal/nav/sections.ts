// App navigation (2026-11-15): Track · Services · Calculators · Account.
// Research and Radar are deliberately not in nav (they will fold into the
// Maal AI advisor); their routes still exist.
// Each Track area groups the existing pages that belong to it; the shell shows
// those pages as tabs at the top of the content (SectionTabs).
// Every sidebar item carries a lucide line icon that says what it is about
// (2026-11-23); `soon` items show a muted "Soon" tag and open the shared
// ComingSoonPage (components/maal/coming-soon).

import {
  House, ArrowLeftRight, ChartPie, ChartColumn, Binoculars, Gauge, Target, ListChecks,
  TrendingUp, ScrollText, Receipt, NotebookPen, Contact, ShieldCheck, HandCoins, Droplets, Archive,
  Settings, CreditCard, Map as MapIcon, type LucideIcon,
} from "lucide-react";

/** `hash` links to a section of the page at `to` (used until a tab gets its own route). */
export type SubPage = { to: string; label: string; hash?: string; icon?: LucideIcon; soon?: boolean };
export type Area = { key: string; label: string; to: string; pages: SubPage[]; icon: LucideIcon; soon?: boolean };

export const TRACK: Area[] = [
  { key: "home", label: "Home", to: "/app", icon: House, pages: [] },
  {
    key: "spending", label: "Spending", to: "/app/spending", icon: ArrowLeftRight,
    pages: [
      // Session 2 (Spending) tab set. Cash and Debts moved to Invest.
      { to: "/app/spending", label: "Overview" },
      { to: "/app/spending/breakdown", label: "Breakdown & budget" },
      { to: "/app/transactions", label: "Transactions" },
      { to: "/app/spending/recurring", label: "Recurring" },
      { to: "/app/spending/reports", label: "Reports" },
    ],
  },
  {
    key: "invest", label: "Invest", to: "/app/invest", icon: ChartPie,
    pages: [
      { to: "/app/invest", label: "Overview" },
      { to: "/app/wealth/investments", label: "Investments" },
      { to: "/app/wealth/super", label: "Super" },
      { to: "/app/wealth/property", label: "Property" },
      { to: "/app/wealth/cash", label: "Cash" },
      { to: "/app/wealth/liabilities", label: "Debts" },
      { to: "/app/wealth/other", label: "Other assets" },
      { to: "/app/assets", label: "Net worth" },
      { to: "/app/portfolio-plan", label: "Portfolio plan" },
    ],
  },
  { key: "equity", label: "Equity", to: "/app/equity", icon: ChartColumn, soon: true, pages: [] },
  {
    key: "forecast", label: "Forecast", to: "/app/forecast", icon: Binoculars,
    pages: [
      { to: "/app/forecast", label: "Overview" },
      { to: "/app/retirement", label: "Retirement" },
      { to: "/app/planning", label: "Financial plan" },
      { to: "/app/net-worth-flow", label: "Net worth flow" },
      { to: "/app/report", label: "Report" },
    ],
  },
  { key: "credit-score", label: "Credit score", to: "/app/credit-score", icon: Gauge, soon: true, pages: [] },
  { key: "goals", label: "Goals", to: "/app/goals", icon: Target, pages: [] },
  { key: "action-plan", label: "Action plan", to: "/app/action-plan", icon: ListChecks, pages: [] },
  { key: "vault", label: "Vault", to: "/app/vault", icon: Archive, pages: [] },
];

export const SERVICES: SubPage[] = [
  { to: "/app/services/brokerage", label: "Brokerage", icon: TrendingUp },
  { to: "/app/services/estate-planning", label: "Estate planning", icon: ScrollText, soon: true },
  { to: "/app/services/tax", label: "Tax", icon: Receipt, soon: true },
  { to: "/app/services/financial-planner", label: "Financial planning", icon: NotebookPen, soon: true },
  { to: "/app/services/cfp-sessions", label: "CFP sessions", icon: Contact, soon: true },
  { to: "/app/services/id-protection", label: "ID protection", icon: ShieldCheck, soon: true },
];

export const CALCULATORS: SubPage[] = [
  { to: "/app/zakat", label: "Zakat", icon: HandCoins },
  { to: "/app/purification", label: "Purification", icon: Droplets },
];

export const ACCOUNT: SubPage[] = [
  { to: "/app/settings", label: "Settings", icon: Settings },
  { to: "/app/privacy", label: "Privacy & Security", icon: ShieldCheck },
  { to: "/app/billing", label: "Plan & Usage", icon: CreditCard },
  { to: "/app/roadmap", label: "Roadmap", icon: MapIcon },
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
