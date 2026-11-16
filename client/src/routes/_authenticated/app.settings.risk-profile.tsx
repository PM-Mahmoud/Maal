import { createFileRoute } from "@tanstack/react-router";
import { RiskProfileSettings } from "@/components/maal/settings/risk/RiskProfileSettings";

// Settings → Risk profile (Figma: "Completing a risk assessment from Settings").
// Renders standalone or inside the settings shell's <Outlet/>.
export const Route = createFileRoute("/_authenticated/app/settings/risk-profile")({ component: RiskProfileSettings });
