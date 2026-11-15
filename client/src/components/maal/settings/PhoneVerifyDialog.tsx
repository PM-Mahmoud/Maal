import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { ApiError, sendPhoneCode, verifyPhoneCode } from "./api";
import "./settings.css";

const LEN = 6;

/**
 * "Updating profile" flow, frames 4–5: we've sent a code → code entered.
 * The code was already sent by the caller (so a send failure shows on the form,
 * not in an empty dialog); this dialog handles entry, resend and verification.
 */
export function PhoneVerifyDialog({
  phoneDisplay, country, number, resendIn, onVerified, onClose,
}: {
  phoneDisplay: string; country: string; number: string; resendIn: number;
  onVerified: (phone: string) => void; onClose: () => void;
}) {
  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(""));
  const [wait, setWait] = useState(resendIn);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  const code = digits.join("");

  async function verify(value = code) {
    if (value.length !== LEN || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await verifyPhoneCode(value);
      onVerified(r.phone);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify the code.");
      setDigits(Array(LEN).fill(""));
      refs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    try {
      const r = await sendPhoneCode(country, number);
      setWait(r.resendIn);
      setNotice("A new code is on its way.");
      setDigits(Array(LEN).fill(""));
      refs.current[0]?.focus();
    } catch (e) {
      if (e instanceof ApiError && e.retryAfter) setWait(e.retryAfter);
      setError(e instanceof Error ? e.message : "Could not resend the code.");
    }
  }

  function setAt(i: number, raw: string) {
    const clean = raw.replace(/\D/g, "");
    if (clean.length > 1) {
      // Paste or SMS autofill of the whole code.
      const next = clean.slice(0, LEN).split("");
      const filled = [...next, ...Array(LEN - next.length).fill("")];
      setDigits(filled);
      refs.current[Math.min(next.length, LEN - 1)]?.focus();
      if (next.length === LEN) void verify(next.join(""));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < LEN - 1) refs.current[i + 1]?.focus();
    if (next.every(Boolean)) void verify(next.join(""));
  }

  const mm = Math.floor(wait / 60);
  const ss = String(wait % 60).padStart(2, "0");

  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="ms-overlay" />
        <Dialog.Content className="mh ms-dialog" onOpenAutoFocus={(e) => { e.preventDefault(); refs.current[0]?.focus(); }}>
          <div className="ms-dialog-head">
            <p className="ms-dialog-kicker">Phone verification</p>
            <Dialog.Close className="mh-close" aria-label="Close"><X className="size-4" /></Dialog.Close>
          </div>
          <div className="ms-dialog-body" style={{ textAlign: "center" }}>
            <Dialog.Title className="ms-dialog-title">We've texted a code to {phoneDisplay}</Dialog.Title>
            <Dialog.Description className="ms-dialog-text" style={{ marginBottom: 0 }}>
              Enter it below to confirm this is your number.
            </Dialog.Description>
            <div className="ms-code" data-invalid={!!error} role="group" aria-label="6-digit code">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { refs.current[i] = el; }}
                  value={d}
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  aria-label={`Digit ${i + 1}`}
                  maxLength={i === 0 ? LEN : 1}
                  disabled={busy}
                  onChange={(e) => setAt(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
                    if (e.key === "Enter") void verify();
                  }}
                />
              ))}
            </div>
            {error && <p className="ms-err" role="alert">{error}</p>}
            {notice && !error && <p className="ms-hint" role="status">{notice}</p>}
            <div className="ms-resend">
              <button type="button" className="mh-link-btn" onClick={resend} disabled={wait > 0}>Resend code</button>
              <span className="mh-muted" aria-live="off">{wait > 0 ? `Resend code in ${mm}:${ss}` : ""}</span>
            </div>
            <div className="ms-save" style={{ marginTop: 18 }}>
              <button type="button" className="mh-btn-ink" onClick={() => verify()} disabled={code.length !== LEN || busy}>
                {busy ? "Checking…" : "Confirm"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
