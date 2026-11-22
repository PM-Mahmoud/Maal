import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ReportsPage } from "@/components/maal/spending/reports/ReportsPage";
import { parseReportSearch, type ReportSearch } from "../../../../shared/report-url.mjs";

// Spending → Reports (redesign session 2, HEL-106/HEL-107).
// Path /app/spending/reports. The trailing underscore on "spending_" opts out
// of nesting under app.spending.tsx, whose component always renders the
// Spending overview (with an <Outlet/> for overlay children like the settings
// drawer) — Reports is a full page of its own, not an overlay.
//
// Report settings live in the search params so refresh, back/forward and a
// shared link keep the view. Every param is whitelisted by parseReportSearch
// (unknown → default, raw text never reflected); the merchant text filter is
// deliberately never in the URL.
export const Route = createFileRoute("/_authenticated/app/spending_/reports")({
  validateSearch: (s: Record<string, unknown>): ReportSearch => parseReportSearch(s),
  component: ReportsRoute,
});

function ReportsRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return <ReportsPage search={search} setSearch={(next) => navigate({ search: next, replace: false })} />;
}
