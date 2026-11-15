import type { ReactNode } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import "./notifications.css";

/** Back goes to the previous screen (usually Settings); a direct load falls back to Home. */
export function useSettingsBack() {
  const router = useRouter();
  const navigate = useNavigate();
  return () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else navigate({ to: "/app" });
  };
}

/** Panel card with the "← LABEL" header from the account-menu designs. */
export function SettingsPanel({
  label, onBack, action, children, labelId,
}: {
  label: string;
  onBack?: () => void;
  action?: ReactNode;
  children: ReactNode;
  labelId: string;
}) {
  return (
    <section className="mt-panel" aria-labelledby={labelId}>
      <div className="mt-head">
        {onBack && (
          <button type="button" className="mt-back" onClick={onBack} aria-label="Back">
            <ArrowLeft aria-hidden />
          </button>
        )}
        <h2 className="mt-kicker" id={labelId}>{label}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
