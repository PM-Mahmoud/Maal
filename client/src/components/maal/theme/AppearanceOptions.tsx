import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePref } from "@/lib/theme";
import "@/components/maal/notifications/notifications.css";

const OPTIONS: { value: ThemePref; label: string; icon: typeof Monitor }[] = [
  { value: "system", label: "Use device settings", icon: Monitor },
  { value: "dark", label: "Dark mode", icon: Moon },
  { value: "light", label: "Light mode", icon: Sun },
];

/**
 * Light / Dark / Use device settings radio list. Used by the Appearance settings
 * page and can sit inline in the account menu's expandable "Appearance" row.
 * Applies instantly and persists to localStorage `maal-theme`.
 */
export function AppearanceOptions({ name = "maal-appearance" }: { name?: string }) {
  const { pref, setPref } = useTheme();
  return (
    <ul className="mt-rows" role="radiogroup" aria-label="Appearance">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <li key={value} role="presentation">
          <label className="mt-row">
            <Icon className="mt-row-icon" aria-hidden />
            <span className="mt-row-text">{label}</span>
            <input
              type="radio"
              className="mt-radio"
              name={name}
              value={value}
              checked={pref === value}
              onChange={() => setPref(value)}
            />
          </label>
        </li>
      ))}
    </ul>
  );
}
