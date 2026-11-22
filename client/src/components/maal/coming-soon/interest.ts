import { handleUnauthenticated } from "@/integrations/api";

/**
 * Records interest in a feature that isn't live yet through the real
 * POST /feedback endpoint (routes/feedback.js → feedback table), tagged
 * `[service-interest] <key>` so it can be counted per feature.
 * Moved here from the old ServicePage (2026-11-23).
 */
export async function registerServiceInterest(key: string): Promise<void> {
  const r = await fetch("/feedback", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: `[service-interest] ${key}`, page: window.location.pathname }),
  });
  if (r.status === 401) {
    handleUnauthenticated();
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (!r.ok) throw new Error("Couldn't save that. Please try again.");
}

const storageKey = (key: string) => `maal_soon_notify_${key}`;

/** Whether this browser already asked to be notified (per feature). Never throws. */
export function hasNotified(key: string): boolean {
  try { return window.localStorage.getItem(storageKey(key)) === "1"; } catch { return false; }
}

export function rememberNotified(key: string): void {
  try { window.localStorage.setItem(storageKey(key), "1"); } catch { /* storage blocked: state lasts this visit only */ }
}
