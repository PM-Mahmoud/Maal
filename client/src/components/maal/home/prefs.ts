import { useSyncExternalStore } from "react";

/**
 * Small persisted Home preferences (per browser, via localStorage):
 *   - privacy mode   `maal-privacy` = "on" — same key and `html[data-privacy="on"]`
 *     attribute the EJS dashboard used, so the concept carries across. Amounts
 *     marked `.mh-amount` are blurred app-wide by home.css while it's on.
 *   - graph hidden   `maal.home.graphHidden` = "1"
 *   - account filter `maal.home.accountFilter` = JSON string[] of account ids
 *     (absent = all accounts).
 * Every read/write is wrapped: storage can be unavailable (private mode).
 */

type Listener = () => void;
const listeners = new Set<Listener>();
function emit() { listeners.forEach((l) => l()); }
function subscribe(l: Listener) {
  listeners.add(l);
  const onStorage = () => l();
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage unavailable — state still applies for this session */ }
  emit();
}

const PRIVACY_KEY = "maal-privacy";
const GRAPH_KEY = "maal.home.graphHidden";
const FILTER_KEY = "maal.home.accountFilter";

function applyPrivacyAttr(on: boolean) {
  if (typeof document === "undefined") return;
  if (on) document.documentElement.setAttribute("data-privacy", "on");
  else document.documentElement.removeAttribute("data-privacy");
}

export function initPrivacy() {
  applyPrivacyAttr(read(PRIVACY_KEY) === "on");
}

export function setPrivacy(on: boolean) {
  applyPrivacyAttr(on);
  write(PRIVACY_KEY, on ? "on" : null);
}

export function usePrivacy(): boolean {
  return useSyncExternalStore(subscribe, () => read(PRIVACY_KEY) === "on", () => false);
}

export function setGraphHidden(hidden: boolean) {
  write(GRAPH_KEY, hidden ? "1" : null);
}

export function useGraphHidden(): boolean {
  return useSyncExternalStore(subscribe, () => read(GRAPH_KEY) === "1", () => false);
}

/** null = all accounts. */
export function setAccountFilter(ids: string[] | null) {
  write(FILTER_KEY, ids ? JSON.stringify(ids) : null);
}

// useSyncExternalStore needs a stable snapshot: cache by raw string.
let filterRaw: string | null = null;
let filterParsed: string[] | null = null;
function readFilter(): string[] | null {
  const raw = read(FILTER_KEY);
  if (raw === filterRaw) return filterParsed;
  filterRaw = raw;
  try {
    const v = raw ? JSON.parse(raw) : null;
    filterParsed = Array.isArray(v) ? v.filter((x) => typeof x === "string") : null;
  } catch { filterParsed = null; }
  return filterParsed;
}

export function useAccountFilter(): string[] | null {
  return useSyncExternalStore(subscribe, readFilter, () => null);
}
