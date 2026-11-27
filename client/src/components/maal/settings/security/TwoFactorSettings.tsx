// Settings → Security: two-factor authentication card.
// Maal's 2FA sends a one-time code by email at sign-in. Authenticator apps are
// shown as "coming soon" (not built yet — see the redesign deferred backlog).
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { InfoLine, SettingsCard } from "../risk/ui";
import { fetchTwoFactor, type TwoFactorStatus } from "./api";
import { TwoFactorDialog } from "./TwoFactorDialog";
import "./two-factor.css";

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" /><path d="m3 5.5 7 5.5 7-5.5" strokeLinejoin="round" />
    </svg>
  );
}
function PhoneKeyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="5.5" y="2.5" width="9" height="15" rx="2" /><path d="M9 14.5h2" strokeLinecap="round" /><circle cx="10" cy="8.5" r="1.8" />
    </svg>
  );
}

export function TwoFactorSettings() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"enable" | "disable" | null>(null);

  const toggle = useRef<HTMLButtonElement>(null);
  const emailDescription = useId();

  function closeDialog() {
    setDialog(null);
    requestAnimationFrame(() => toggle.current?.focus());
  }

  const load = useCallback(async () => {
    setError(null);
    try { setStatus(await fetchTwoFactor()); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load your security settings."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const enabled = !!status?.enabled;

  return (
    <div className="mst mst-page">
      <SettingsCard kicker="Two-factor authentication">
        {error ? (
          <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
            <p className="mst-alert" role="alert">{error}</p>
            <button type="button" className="mst-btn mst-btn-line" onClick={() => void load()}>Try again</button>
          </div>
        ) : !status ? (
          <div aria-busy="true" aria-label="Loading security settings" style={{ display: "grid", gap: 10 }}>
            <div className="mst-skel" style={{ height: 72 }} />
            <div className="mst-skel" style={{ height: 72 }} />
          </div>
        ) : (
          <>
            <p className="mst-lede" style={{ fontSize: 15.5, color: "var(--mst-muted)" }}>
              Add a second step when you sign in, so your accounts, balances and documents stay private even if someone learns your password.
            </p>
            <div className="mst-methods">
              <div className="mst-method mst-2fa-method">
                <span className="mst-method-icon"><MailIcon /></span>
                <div className="mst-method-text">
                  <strong>Email code</strong>
                  <span id={emailDescription}>{enabled ? `A 6-digit code goes to ${status.email} each time you sign in.` : `We’ll email a 6-digit code to ${status.email} each time you sign in.`}</span>
                </div>
                <button
                  ref={toggle}
                  type="button"
                  role="switch"
                  className="mst-2fa-switch"
                  aria-label="Two-factor authentication by email"
                  aria-describedby={emailDescription}
                  aria-checked={enabled}
                  aria-haspopup="dialog"
                  onClick={() => setDialog(enabled ? "disable" : "enable")}
                >
                  <span aria-hidden="true">{enabled ? "On" : "Off"}</span>
                  <span className="mst-2fa-track" aria-hidden="true" />
                </button>
              </div>
              <div className="mst-method is-disabled" aria-disabled="true">
                <span className="mst-method-icon"><PhoneKeyIcon /></span>
                <div className="mst-method-text">
                  <strong>Authenticator app</strong>
                  <span>Use an app on your phone to generate sign-in codes.</span>
                </div>
                <span className="mst-badge">Coming soon</span>
              </div>
            </div>
            <InfoLine>Two-factor authentication applies when you sign in with your email and password. If you sign in with Google, your Google account’s own security settings also apply.</InfoLine>
          </>
        )}
      </SettingsCard>

      {dialog && status && (
        <TwoFactorDialog
          mode={dialog}
          status={status}
          onClose={closeDialog}
          onChanged={(on) => setStatus((s) => (s ? { ...s, enabled: on, pending: null } : s))}
        />
      )}
    </div>
  );
}
