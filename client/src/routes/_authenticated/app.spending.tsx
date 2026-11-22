import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SpendingOverview } from "@/components/maal/spending/overview/SpendingOverview";

// Spending overview (redesign session 2, HEL-83).
export const Route = createFileRoute("/_authenticated/app/spending")({ component: Spending });

function Spending() {
  return (
    <div className="ss-entry">
      <SpendingOverview />
      {/* Child routes (e.g. /app/spending/settings drawer) render over the page. */}
      <Outlet />
    </div>
  );
}
