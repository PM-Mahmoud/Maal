import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

/**
 * Quick light/dark switch. Flipping it sets an explicit preference; the full
 * Light / Dark / Use device settings choice lives in Settings → Appearance.
 */
export function ThemeToggle() {
  const { resolved, setPref } = useTheme();
  const dark = resolved === "dark";
  return (
    <button
      type="button"
      onClick={() => setPref(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="size-7 rounded-full border border-border flex items-center justify-center hover:bg-[var(--secondary)] transition-colors"
    >
      {dark ? <Moon className="size-3.5" aria-hidden /> : <Sun className="size-3.5" aria-hidden />}
    </button>
  );
}
