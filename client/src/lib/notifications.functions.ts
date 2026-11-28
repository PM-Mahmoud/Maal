import { shareInFlight } from '@/lib/in-flight';

// NotificationBell mounts in both the sidebar and the mobile top bar — share one fetch.
export const listNotifications = shareInFlight(async (): Promise<unknown[]> => {
  const r = await fetch('/api/v1/notifications', { credentials: 'include' });
  const j = r.ok ? await r.json() : null;
  return Array.isArray(j) ? j : [];
});
/** Fired after the inbox marks notifications read, so the bell badge can refresh. */
export const NOTIFICATIONS_READ_EVENT = 'maal:notifications-read';

/** Marks the given notification ids read (the server ignores calls with no ids). */
export async function markNotificationsRead(ids: Array<number | string> = []): Promise<void> {
  if (!ids.length) return;
  await fetch('/api/v1/notifications/read', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}
