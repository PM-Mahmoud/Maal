import { createFileRoute } from "@tanstack/react-router";
import { NotificationsInbox } from "@/components/maal/notifications/NotificationsInbox";
import { NotificationPrefs } from "@/components/maal/notifications/NotificationPrefs";
import { SettingsPanel, useSettingsBack } from "@/components/maal/notifications/SettingsPanel";

export const Route = createFileRoute("/_authenticated/app/settings/notifications")({
  component: NotificationsPage,
});

/** Account menu → Notifications: the inbox, plus which emails Maal sends you. */
function NotificationsPage() {
  const back = useSettingsBack();
  return (
    <div className="mh mh-page mt-page">
      <h1 className="sr-only">Notifications</h1>
      <div className="mt-stack">
        <SettingsPanel label="Notifications" labelId="mt-inbox" onBack={back}>
          <NotificationsInbox />
        </SettingsPanel>
        <SettingsPanel label="Email and alerts" labelId="mt-prefs">
          <NotificationPrefs />
        </SettingsPanel>
      </div>
    </div>
  );
}
