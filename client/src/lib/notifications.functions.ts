export async function listNotifications(): Promise<unknown[]> {
  const r = await fetch('/api/v1/notifications', { credentials: 'include' });
  const j = r.ok ? await r.json() : null;
  return Array.isArray(j) ? j : [];
}
export async function markNotificationsRead(): Promise<void> {
  await fetch('/api/v1/notifications/read', { method: 'POST', credentials: 'include' });
}
export async function savePushSubscription(data?: unknown): Promise<void> {
  await fetch('/api/v1/push/subscribe', { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
}
export async function removePushSubscription(data?: unknown): Promise<void> {
  await fetch('/api/v1/push/unsubscribe', { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
}
