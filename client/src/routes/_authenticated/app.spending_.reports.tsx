import { createFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "@/components/maal/spending/reports/ReportsPage";

// Spending → Reports (redesign session 2, HEL-106/HEL-107).
// Path /app/spending/reports. The trailing underscore on "spending_" opts out
// of nesting under app.spending.tsx, whose component always renders the
// Spending overview (with an <Outlet/> for overlay children like the settings
// drawer) — Reports is a full page of its own, not an overlay.
export const Route = createFileRoute("/_authenticated/app/spending_/reports")({ component: ReportsPage });
