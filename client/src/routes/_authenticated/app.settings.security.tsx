import { createFileRoute } from "@tanstack/react-router";
import { TrainingPrivacy } from "@/components/maal/settings/security/TrainingPrivacy";
import { TwoFactorSettings } from "@/components/maal/settings/security/TwoFactorSettings";

// Settings → Security (Figma: "Setting up two-factor authentication from Settings").
// Renders standalone or inside the settings shell's <Outlet/>.
export const Route = createFileRoute("/_authenticated/app/settings/security")({ component: SecuritySettings });

function SecuritySettings() {
  return <><TrainingPrivacy /><TwoFactorSettings /></>;
}
