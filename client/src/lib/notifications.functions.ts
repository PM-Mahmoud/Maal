export async function listNotifications() {
  const r = await fetch("/api/v1/notifications", { credentials: "include" });
  if (!r.ok) return [];
  return r.json();
}
export async function markNotificationsRead() {
  await fetch("/api/v1/notifications/read", { method: "POST", credentials: "include" });
}
export async function savePushSubscription(data?: unknown) { return fetch('/api/v1/push/subscribe', { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) }); }
export async function removePushSubscription(data?: unknown) { return fetch('/api/v1/push/unsubscribe', { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) }); }
