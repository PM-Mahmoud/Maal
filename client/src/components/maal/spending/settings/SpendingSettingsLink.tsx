import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import "./spending-settings.css";

/** Settings cog on the Spending page → /app/spending/settings. */
export function SpendingSettingsLink() {
  return (
    <Link to="/app/spending/settings" className="ss-cog" aria-label="Spending settings" title="Spending settings">
      <Settings aria-hidden />
    </Link>
  );
}
