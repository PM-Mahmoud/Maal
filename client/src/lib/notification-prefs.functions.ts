// Notification preferences (PR 10) — currently the daily portfolio digest opt-in.
export async function getNotificationPrefs(): Promise<{ daily_digest: boolean }> {
  const r = await fetch('/api/v1/notification-prefs', { credentials: 'include' });
  const j = r.ok ? await r.json() : null;
  return { daily_digest: !!(j && j.daily_digest) };
}

export async function setNotificationPref(key: string, value: boolean): Promise<boolean> {
  const r = await fetch('/api/v1/notification-prefs', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  return r.ok;
}
