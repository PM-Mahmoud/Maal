import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SpendingSettingsDrawer } from "@/components/maal/spending/settings/SpendingSettingsDrawer";

type SettingsSearch = { panel?: "budget" | "categories" };

// Spending settings (Figma 2026-11): a drawer over the Spending page. Child of
// /app/spending, so the Spending page stays rendered underneath (its <Outlet/>).
// ?panel=budget|categories opens straight on that panel (the overview's
// "Create budget" / "Edit budget" links); anything else is ignored.
export const Route = createFileRoute("/_authenticated/app/spending/settings")({
  validateSearch: (search: Record<string, unknown>): SettingsSearch =>
    search.panel === "budget" || search.panel === "categories" ? { panel: search.panel } : {},
  component: SpendingSettingsRoute,
});

function SpendingSettingsRoute() {
  const navigate = useNavigate();
  const { panel } = Route.useSearch();
  return <SpendingSettingsDrawer initialPanel={panel} onClose={() => navigate({ to: "/app/spending" })} />;
}
