import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SpendingSettingsDrawer } from "@/components/maal/spending/settings/SpendingSettingsDrawer";

// Spending settings (Figma 2026-11): a drawer over the Spending page. Child of
// /app/spending, so the Spending page stays rendered underneath (its <Outlet/>).
export const Route = createFileRoute("/_authenticated/app/spending/settings")({ component: SpendingSettingsRoute });

function SpendingSettingsRoute() {
  const navigate = useNavigate();
  return <SpendingSettingsDrawer onClose={() => navigate({ to: "/app/spending" })} />;
}
