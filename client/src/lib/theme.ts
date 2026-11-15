import { useEffect, useState } from "react";

/**
 * Theme preference (Light / Dark / Use device settings).
 *
 * Stored in localStorage under the existing `maal-theme` key ("light" | "dark" |
 * "system"; a missing key means "system"). The resolved theme is applied to
 * <html> as BOTH `data-theme="dark|light"` (v2 / EJS stylesheets) and the
 * `.dark` class (Tailwind's dark variant + home/advisor scopes), so every
 * stylesheet in the app keys off the same switch.
 *
 * index.html runs an inline copy of `resolve` + `apply` before first paint so
 * there is no flash of the wrong theme — keep the two in step.
 */
export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "maal-theme";
const EVENT = "maal:theme";

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  try {
    return !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === "system") return systemPrefersDark() ? "dark" : "light";
  return pref;
}

export function applyTheme(resolved: ResolvedTheme) {
  const el = document.documentElement;
  el.setAttribute("data-theme", resolved);
  el.classList.toggle("dark", resolved === "dark");
  el.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#050505" : "#020109");
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.setItem(THEME_KEY, "system");
    else localStorage.setItem(THEME_KEY, pref);
  } catch { /* storage blocked: still apply for this page view */ }
  applyTheme(resolveTheme(pref));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: pref }));
}

let watching = false;
/** Follow OS changes while the preference is "system". Idempotent. */
export function initTheme() {
  applyTheme(resolveTheme(getThemePref()));
  if (watching || typeof window === "undefined" || !window.matchMedia) return;
  watching = true;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (getThemePref() === "system") {
      applyTheme(resolveTheme("system"));
      window.dispatchEvent(new CustomEvent(EVENT, { detail: "system" }));
    }
  };
  mq.addEventListener?.("change", onChange);
  // Another tab changed the preference.
  window.addEventListener("storage", (e) => {
    if (e.key === THEME_KEY) {
      applyTheme(resolveTheme(getThemePref()));
      window.dispatchEvent(new CustomEvent(EVENT, { detail: getThemePref() }));
    }
  });
}

/** React binding: current preference + resolved theme, kept in sync app-wide. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(() => (typeof window === "undefined" ? "system" : getThemePref()));
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    typeof window === "undefined" ? "light" : resolveTheme(getThemePref()),
  );
  useEffect(() => {
    initTheme();
    const sync = () => {
      const p = getThemePref();
      setPref(p);
      setResolved(resolveTheme(p));
    };
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return {
    pref,
    resolved,
    setPref: (p: ThemePref) => setThemePref(p),
  };
}
