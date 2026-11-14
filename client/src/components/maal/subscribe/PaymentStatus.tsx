import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { MaalMark } from "@/components/maal/MaalMark";
import { fetchPaymentStatus } from "./offer";

// Payment processing + Payment success (Figma frames 03 and 04): the page
// behind is blurred under a grey wash, a pulsing Maal mark sits in the middle
// and a notification card in the top-right says where the payment is up to.

export type PaymentPhase = "processing" | "success" | "error" | "timeout";

/** Polls GET /billing/status until the plan is active.
 *  - preview: client-only walkthrough (no network), resolves after ~2.4s.
 *  - stops after `maxTries` polls with "timeout" (the webhook may still land). */
export function usePaymentPolling({
  sessionId,
  preview,
  enabled,
  intervalMs = 2000,
  maxTries = 30,
}: {
  sessionId?: string | null;
  preview?: boolean;
  enabled: boolean;
  intervalMs?: number;
  maxTries?: number;
}) {
  const [phase, setPhase] = useState<PaymentPhase>("processing");
  const [progress, setProgress] = useState(0.2);
  const [attempt, setAttempt] = useState(0); // bump to restart after a timeout

  useEffect(() => {
    if (!enabled) return;
    setPhase("processing");
    setProgress(0.2);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (preview) {
      timer = setTimeout(() => { if (!cancelled) { setProgress(1); setPhase("success"); } }, 2400);
      const tick = setInterval(() => setProgress((p) => Math.min(0.9, p + 0.12)), 400);
      return () => { cancelled = true; clearTimeout(timer); clearInterval(tick); };
    }

    let tries = 0;
    const poll = async () => {
      tries += 1;
      const state = await fetchPaymentStatus(sessionId);
      if (cancelled) return;
      if (state === "active") { setProgress(1); setPhase("success"); return; }
      if (state === "failed") { setPhase("error"); return; }
      if (tries >= maxTries) { setPhase("timeout"); return; }
      // Ease towards 90% so the bar keeps moving without claiming completion.
      setProgress((p) => p + (0.9 - p) * 0.25);
      timer = setTimeout(poll, intervalMs);
    };
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [enabled, preview, sessionId, intervalMs, maxTries, attempt]);

  return { phase, progress, retry: () => setAttempt((a) => a + 1) };
}

/** The overlay + notification. Render it on top of the (blurred) subscribe page. */
export function PaymentStatusOverlay({
  phase,
  progress,
  onDone,
  onRetry,
  onBackToPlan,
  autoContinueMs = 3500,
}: {
  phase: PaymentPhase;
  progress: number;
  onDone: () => void;
  onRetry?: () => void;
  onBackToPlan?: () => void;
  autoContinueMs?: number;
}) {
  const [toastOpen, setToastOpen] = useState(true);
  const [countdown, setCountdown] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // Success: fill the bar over autoContinueMs, then carry on to the dashboard.
  useEffect(() => {
    if (phase !== "success") return;
    setToastOpen(true);
    const start = Date.now();
    const tick = setInterval(() => {
      const f = Math.min(1, (Date.now() - start) / autoContinueMs);
      setCountdown(f);
      if (f >= 1) { clearInterval(tick); doneRef.current(); }
    }, 80);
    return () => clearInterval(tick);
  }, [phase, autoContinueMs]);

  let toast: ReactNode = null;
  if (phase === "processing") {
    toast = (
      <Toast tone="info" icon="i" title="Processing" onClose={() => setToastOpen(false)}
        body="Please wait while we confirm your payment."
        bar={<Bar value={progress} />} />
    );
  } else if (phase === "success") {
    toast = (
      <Toast tone="ok" icon={<Check className="size-3" strokeWidth={3} />} title="Success" onClose={onDone}
        body="Your payment went through. Welcome to Maal, your membership is active."
        bar={<Bar value={countdown} ok />}
        actions={<button type="button" className="ms-btn ms-btn-ink" onClick={onDone}>Go to my dashboard</button>} />
    );
  } else if (phase === "timeout") {
    toast = (
      <Toast tone="info" icon="i" title="Still confirming" onClose={() => setToastOpen(false)}
        body="Your bank is taking a little longer than usual. If the payment went through, your membership switches on automatically, usually within a few minutes."
        bar={<Bar value={0.9} />}
        actions={<>
          {onRetry && <button type="button" className="ms-btn ms-btn-ink" onClick={onRetry}>Check again</button>}
          <button type="button" className="ms-btn ms-btn-line" onClick={onDone}>Go to my dashboard</button>
        </>} />
    );
  } else {
    toast = (
      <Toast tone="err" icon="!" title="Payment not completed" onClose={onBackToPlan ?? onDone}
        body="We couldn't confirm this payment and nothing has changed on your account. You can try again."
        actions={onBackToPlan && <button type="button" className="ms-btn ms-btn-ink" onClick={onBackToPlan}>Back to plan</button>} />
    );
  }

  return (
    <>
      <div className="ms-overlay" role="status" aria-live="polite" aria-label={phase === "success" ? "Payment successful" : "Processing payment"}>
        <span className={`ms-loader ${phase === "success" ? "ms-loader-done" : ""}`}>
          <MaalMark size={84} />
        </span>
      </div>
      {toastOpen && toast}
    </>
  );
}

function Toast({ tone, icon, title, body, bar, actions, onClose }: {
  tone: "info" | "ok" | "err";
  icon: ReactNode;
  title: string;
  body: string;
  bar?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="msub ms-toast" role={tone === "err" ? "alert" : "status"}>
      <span className={`ms-toast-icon ms-toast-${tone}`} aria-hidden="true">{icon}</span>
      <p className="ms-toast-title">{title}</p>
      <p className="ms-toast-body">{body}</p>
      {actions && <div className="ms-toast-actions">{actions}</div>}
      <button type="button" className="ms-toast-close" onClick={onClose} aria-label="Dismiss">
        <X className="size-5" strokeWidth={1.6} />
      </button>
      {bar}
    </div>
  );
}

function Bar({ value, ok }: { value: number; ok?: boolean }) {
  return (
    <div className={`ms-toast-track ${ok ? "is-ok" : ""}`} aria-hidden="true">
      <div className="ms-toast-bar" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}
