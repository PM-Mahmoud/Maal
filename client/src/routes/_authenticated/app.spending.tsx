import { createFileRoute, Outlet } from "@tanstack/react-router";
import { EmptyPage } from "@/components/maal/nav/EmptyPage";
import { SpendingSettingsLink } from "@/components/maal/spending/settings/SpendingSettingsLink";

// Left empty until the Figma designs are finalised (2026-11-15).
export const Route = createFileRoute("/_authenticated/app/spending")({ component: Spending });

function Spending() {
  return (
    <div className="ss-entry">
      <SpendingSettingsLink />
      <EmptyPage title="Spending" />
      {/* Child routes (e.g. /app/spending/settings drawer) render over the page. */}
      <Outlet />
    </div>
  );
}
