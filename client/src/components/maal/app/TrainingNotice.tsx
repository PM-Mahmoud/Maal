import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useTrainingConsent } from "./TrainingConsentProvider";

// One-time notice for users who have not yet been shown the current
// model-training policy (spec D4). Nothing of theirs is eligible until they
// choose; "Allow" records an opt-in, "No thanks" records an opt-out. Opt-in
// only: nothing is used unless the user chooses "Allow".
export function TrainingNotice() {
  const { consent, saving, save } = useTrainingConsent();
  const [saveFailed, setSaveFailed] = useState(false);

  if (!consent?.general.needsNotice) return null;

  async function choose(granted: boolean) {
    setSaveFailed(false);
    if (!await save(granted, "notice")) setSaveFailed(true);
  }

  return (
    <div role="region" aria-label="AI improvement notice"
      className="mx-4 md:mx-8 mt-4 rounded-[12px] border border-border bg-[var(--surface)] px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
      <p className="text-[13px] leading-relaxed flex-1">
        <Sparkles className="inline size-3.5 mr-1.5 -mt-0.5" />
        <span className="font-semibold">Help improve Maal.</span>{" "}
        With your permission, Maal can use de-identified data from your chats, uploads and details you enter to improve its AI. Bank data
        from the Consumer Data Right is never included. You can change this anytime in{" "}
        <Link to="/app/settings/security" className="underline underline-offset-2">Privacy &amp; Security</Link>.
        {saveFailed && <span role="alert" className="block mt-1">Couldn’t save your choice. Please try again.</span>}
      </p>
      <div className="flex gap-2 shrink-0">
        <button type="button" disabled={saving} onClick={() => choose(false)}
          className="h-8 px-3 rounded-[8px] border border-border text-[13px] font-medium disabled:opacity-50">
          No thanks
        </button>
        <button type="button" disabled={saving} onClick={() => choose(true)}
          className="h-8 px-3 rounded-[8px] bg-foreground text-background text-[13px] font-medium disabled:opacity-50">
          Allow
        </button>
      </div>
    </div>
  );
}
