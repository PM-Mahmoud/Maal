import { createFileRoute } from "@tanstack/react-router";
import { AppearanceOptions } from "@/components/maal/theme/AppearanceOptions";
import { SettingsPanel, useSettingsBack } from "@/components/maal/notifications/SettingsPanel";

export const Route = createFileRoute("/_authenticated/app/settings/appearance")({
  component: AppearancePage,
});

/** Account menu → Appearance: Use device settings / Dark mode / Light mode. */
function AppearancePage() {
  const back = useSettingsBack();
  return (
    <div className="mh mh-page mt-page">
      <h1 className="sr-only">Appearance</h1>
      <SettingsPanel label="Appearance" labelId="mt-appearance" onBack={back}>
        <AppearanceOptions />
        <p className="mt-note">“Use device settings” follows your phone or computer’s light or dark setting.</p>
      </SettingsPanel>
    </div>
  );
}
