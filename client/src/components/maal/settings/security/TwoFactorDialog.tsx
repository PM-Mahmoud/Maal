// Two-factor authentication dialog. Turning on: explain → email a code →
// verify → done. Turning off: password re-auth (or an emailed code for
// accounts that sign in without a password) → done.
import { useEffect, useRef, useState } from "react";
import { Artwork, Dialog, InfoLine } from "../risk/ui";
import { confirmTwoFactor, disableTwoFactorWithPassword, startTwoFactor, SecurityError, type TwoFactorStatus } from "./api";

type Mode = "enable" | "disable";
type Phase = "intro" | "code" | "password" | "done";

const RESEND_SECONDS = 30;

export function TwoFactorDialog({ mode, status, onClose, onChanged }: {
  mode: Mode;
  status: TwoFactorStatus;
  onClose: () => void;
  onChanged: (enabled: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>(mode === "disable" && status.hasPassword ? "password" : "intro");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState(status.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (phase === "code") codeRef.current?.focus();
    else if (phase === "done") headingRef.current?.focus();
  }, [phase]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const kicker = mode === "enable" ? "Two-factor authentication" : "Turn off two-factor authentication";
  const errMsg = (e: unknown) => (e instanceof SecurityError || e instanceof Error ? e.message : "Something went wrong. Please try again.");

  async function sendCode() {
    setBusy(true); setError(null);
    try {
      const r = await startTwoFactor(mode);
      setSentTo(r.sentTo);
      setCode("");
      setCooldown(RESEND_SECONDS);
      setPhase("code");
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  }

  async function verify() {
    if (code.replace(/\D/g, "").length !== 6) { setError("Enter the 6-digit code from your email."); return; }
    setBusy(true); setError(null);
    try {
      const r = await confirmTwoFactor(code);
      onChanged(r.enabled);
      setPhase("done");
    } catch (e) {
      setError(errMsg(e));
      if (e instanceof SecurityError && (e.code === "expired" || e.code === "no_pending")) setCooldown(0);
    } finally { setBusy(false); }
  }

  async function disableWithPassword() {
    if (!password) { setError("Enter your password."); return; }
    setBusy(true); setError(null);
    try {
      await disableTwoFactorWithPassword(password);
      setPassword("");
      onChanged(false);
      setPhase("done");
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  }

  const alert = error ? <p className="mst-alert" role="alert" style={{ marginTop: 16 }}>{error}</p> : null;

  if (phase === "intro") {
    return (
      <Dialog kicker={kicker} labelledBy="mst-2fa-title" onClose={onClose}
        footer={<>
          <button type="button" className="mst-btn mst-btn-line" onClick={onClose}>Cancel</button>
          <button type="button" className="mst-btn mst-btn-ink" data-autofocus onClick={() => void sendCode()} disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button>
        </>}>
        <div className="mst-dialog-center">
          <Artwork small />
          <h2 id="mst-2fa-title" style={{ marginTop: 14 }}>{mode === "enable" ? "Add a second step to sign-in" : "Confirm it’s you"}</h2>
          {mode === "enable" ? (
            <>
              <p className="mst-lede">With two-factor authentication on, signing in to Maal needs your password and a one-time code we email you — so your finances stay private even if your password leaks.</p>
              <ol className="mst-steps">
                <li><b>1</b><span>We’ll email a 6-digit code to <strong>{status.email}</strong>.</span></li>
                <li><b>2</b><span>Enter it here to prove the inbox is yours.</span></li>
                <li><b>3</b><span>From then on, each sign-in asks for a fresh code.</span></li>
              </ol>
            </>
          ) : (
            <p className="mst-lede">Your account signs in without a password, so we’ll email a code to <strong>{status.email}</strong> to confirm it’s you before turning this off.</p>
          )}
        </div>
        {alert}
      </Dialog>
    );
  }

  if (phase === "password") {
    return (
      <Dialog kicker={kicker} labelledBy="mst-2fa-title" onClose={onClose}
        footer={<>
          <button type="button" className="mst-btn mst-btn-line" onClick={onClose}>Cancel</button>
          <button type="submit" form="mst-2fa-pw" className="mst-btn mst-btn-ink" disabled={busy || !password}>{busy ? "Checking…" : "Turn off"}</button>
        </>}>
        <form id="mst-2fa-pw" onSubmit={(e) => { e.preventDefault(); void disableWithPassword(); }}>
          <h2 id="mst-2fa-title">Confirm your password</h2>
          <p className="mst-lede" style={{ marginTop: 10 }}>Turning off two-factor authentication makes your account easier to get into. Enter your password to continue.</p>
          <label className="mst-input" style={{ marginTop: 22 }}>
            <span>Password</span>
            <input type="password" autoComplete="current-password" value={password} data-autofocus onChange={(e) => setPassword(e.target.value)} />
          </label>
          {alert}
        </form>
      </Dialog>
    );
  }

  if (phase === "code") {
    return (
      <Dialog kicker={kicker} labelledBy="mst-2fa-title" onClose={onClose}
        footer={<>
          <button type="button" className="mst-btn mst-btn-line" onClick={() => { setError(null); setPhase("intro"); }} disabled={busy}>Back</button>
          <button type="submit" form="mst-2fa-code" className="mst-btn mst-btn-ink" disabled={busy || code.replace(/\D/g, "").length !== 6}>{busy ? "Verifying…" : mode === "enable" ? "Verify and turn on" : "Verify and turn off"}</button>
        </>}>
        <form id="mst-2fa-code" className="mst-dialog-center" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
          <h2 id="mst-2fa-title" ref={headingRef} tabIndex={-1} style={{ outline: "none" }}>Check your email</h2>
          <p className="mst-lede">We sent a 6-digit code to <strong>{sentTo}</strong>. It expires in 10 minutes.</p>
          <label style={{ width: "100%", display: "grid", justifyItems: "center", gap: 8, marginTop: 8 }}>
            <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>6-digit code</span>
            <input ref={codeRef} className="mst-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000000"
              value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, "").slice(0, 7))} />
          </label>
          <button type="button" className="mst-btn mst-btn-text" onClick={() => void sendCode()} disabled={busy || cooldown > 0}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
          <p className="mst-info" style={{ justifyContent: "center" }}>Can’t see it? Check your spam or promotions folder.</p>
        </form>
        {alert}
      </Dialog>
    );
  }

  return (
    <Dialog kicker={kicker} labelledBy="mst-2fa-title" onClose={onClose}
      footer={<button type="button" className="mst-btn mst-btn-ink" onClick={onClose}>Done</button>}>
      <div className="mst-dialog-center">
        <Artwork small />
        <h2 id="mst-2fa-title" ref={headingRef} tabIndex={-1} style={{ marginTop: 14, outline: "none" }}>
          {mode === "enable" ? "Two-factor authentication is on" : "Two-factor authentication is off"}
        </h2>
        <p className="mst-lede">
          {mode === "enable"
            ? `Next time you sign in, we’ll email a code to ${status.email} after your password.`
            : "You’ll sign in with just your password. You can turn this back on at any time."}
        </p>
      </div>
      {mode === "enable" && (
        <div style={{ marginTop: 18 }}>
          <InfoLine>Keep access to this inbox. If you change email providers, update your Maal email first so you don’t get locked out.</InfoLine>
        </div>
      )}
    </Dialog>
  );
}
