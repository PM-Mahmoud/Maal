import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BreakdownPage, type BreakdownSearch } from "@/components/maal/spending/breakdown/BreakdownPage";

// Spending › Breakdown & budget (redesign session 2, HEL-84..HEL-90).
// "spending_" keeps this OUT of the /app/spending layout (which renders the
// overview above its <Outlet/>); the URL is still /app/spending/breakdown.
const TABS = ["expenses", "budget", "income"] as const;
const PANELS = ["edit", "manage", "ai"] as const;

export const Route = createFileRoute("/_authenticated/app/spending_/breakdown")({
  validateSearch: (s: Record<string, unknown>): BreakdownSearch => ({
    month: typeof s.month === "string" && /^\d{4}-\d{2}$/.test(s.month) ? s.month : undefined,
    tab: TABS.includes(s.tab as (typeof TABS)[number]) ? (s.tab as BreakdownSearch["tab"]) : undefined,
    cat: typeof s.cat === "string" && s.cat.length > 0 && s.cat.length <= 60 ? s.cat : undefined,
    panel: PANELS.includes(s.panel as (typeof PANELS)[number]) ? (s.panel as BreakdownSearch["panel"]) : undefined,
  }),
  component: BreakdownRoute,
});

function BreakdownRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <BreakdownPage search={search}
      setSearch={(patch) => navigate({ search: (prev: BreakdownSearch) => ({ ...prev, ...patch }), replace: false })} />
  );
}
