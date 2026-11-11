import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { getTrainingConsent, setTrainingConsent } from "@/lib/privacy.functions";

// One-time notice for users who have not yet been shown the current
// model-training policy (spec D4). Nothing of theirs is eligible until they
// choose; "Got it" records an opt-in, "Turn off" records an opt-out.
export function TrainingNotice() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getTrainingConsent()
      .then((c) => setShow(!!c?.general.needsNotice))
      .catch(() => { /* never block the app on this */ });
  }, []);

  if (!show) return null;

  async function choose(granted: boolean) {
    setBusy(true);
    const r = await setTrainingConsent(granted, "notice").catch(() => null);
    setBusy(false);
    if (r) setShow(false);
  }

  return (
    <div role="region" aria-label="AI improvement notice"
      className="mx-4 md:mx-8 mt-4 rounded-[12px] border border-border bg-[var(--surface)] px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
      <p className="text-[13px] leading-relaxed flex-1">
        <Sparkles className="inline size-3.5 mr-1.5 -mt-0.5" />
        <span className="font-semibold">Help improve Maal.</span>{" "}
        Maal can use de-identified data from your chats, uploads and details you enter to improve its AI. Bank data
        from the Consumer Data Right is never included. You can change this anytime in{" "}
        <Link to="/app/privacy" className="underline underline-offset-2">Privacy &amp; Security</Link>.
      </p>
      <div className="flex gap-2 shrink-0">
        <button type="button" disabled={busy} onClick={() => choose(false)}
          className="h-8 px-3 rounded-[8px] border border-border text-[13px] font-medium disabled:opacity-50">
          Turn off
        </button>
        <button type="button" disabled={busy} onClick={() => choose(true)}
          className="h-8 px-3 rounded-[8px] bg-foreground text-background text-[13px] font-medium disabled:opacity-50">
          Got it
        </button>
      </div>
    </div>
  );
}
