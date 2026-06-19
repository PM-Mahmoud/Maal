import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("maal-theme") : null;
    const prefers = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const isDark = stored ? stored === "dark" : !!prefers;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("maal-theme", next ? "dark" : "light"); } catch {}
  }
  return (
    <button onClick={toggle} aria-label="Toggle theme"
      className="size-7 rounded-full border border-border flex items-center justify-center hover:bg-[var(--secondary)] transition-colors">
      <span className="text-[12px]">{dark ? "☾" : "☀"}</span>
    </button>
  );
}