import { useState } from "react";
import { ShieldCheck, Lock, Eye, Landmark, Trash2, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTrainingConsent } from "@/components/maal/app/TrainingConsentProvider";

const SECURITY_POINTS = [
  { icon: Landmark, title: "Read-only bank access", body: "Bank connections use Australia's Consumer Data Right. Maal can read your accounts but can't move money or change anything." },
  { icon: Lock, title: "Your bank login stays with your bank", body: "You sign in on your bank's own consent screen. Maal never sees or stores your banking username or password." },
  { icon: Eye, title: "Encrypted and access-controlled", body: "Your data is encrypted in transit and at rest, and only your signed-in session can reach it." },
  { icon: Trash2, title: "You're in control", body: "Disconnect any account or delete your data at any time. Your data is never sold." },
];

export function TrainingPrivacy() {
  const { consent, loading, saving, save } = useTrainingConsent();
  const [error, setError] = useState<string | null>(null);

  async function update(granted: boolean) {
    setError(null);
    if (!await save(granted, "settings")) setError("Couldn't save that change. Please try again.");
  }

  const granted = !!consent?.general.granted;

  return (
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-10">
      <div className="flex items-center gap-2.5 mb-1">
        <ShieldCheck className="size-5" />
        <h1 className="text-[22px] font-bold tracking-display">Privacy &amp; Security</h1>
      </div>
      <p className="text-[13px] text-muted-foreground mb-8">
        How Maal protects your data, and how you choose whether it helps improve Maal's AI.
      </p>

      <section className="mb-10">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground mb-3">Privacy</h2>
        <div className="rounded-[14px] border border-border bg-[var(--surface)] p-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-[15px] font-semibold flex items-center gap-2">
                <Sparkles className="size-4" /> Help improve Maal's AI
              </p>
              <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
                Allow Maal to use <strong className="text-foreground">de-identified</strong> data from your chats, uploaded
                files and details you enter, plus usage signals, to train, evaluate and improve its AI. Maal works the same
                either way.
              </p>
            </div>
            {loading ? (
              <span className="text-[12px] text-muted-foreground shrink-0">Loading…</span>
            ) : consent ? (
              <Switch
                checked={granted}
                disabled={saving}
                onCheckedChange={(v) => update(v)}
                aria-label="Help improve Maal's AI"
                className="mt-1 shrink-0"
              />
            ) : null}
          </div>

          {!loading && !consent && (
            <p className="text-[13px] text-muted-foreground mt-3">Couldn't load this setting right now.</p>
          )}
          {consent?.general.needsNotice && (
            <p className="text-[12px] mt-3 px-3 py-2 rounded-[8px] bg-[var(--secondary)]">
              This setting is new. Until you choose, nothing of yours is used.
            </p>
          )}
          {error && <p className="text-[12px] text-red-500 mt-3">{error}</p>}

          <ul className="mt-5 space-y-2.5 text-[13px] text-muted-foreground leading-relaxed">
            <li><span className="font-semibold text-foreground">De-identified first.</span> Names, emails, account numbers, BSBs and addresses are removed or replaced, and nothing stays linked to your account.</li>
            <li><span className="font-semibold text-foreground">Only from when you agreed.</span> Data from before you agreed to the current policy is excluded. Turning this off removes your data from anything built afterwards.</li>
            <li><span className="font-semibold text-foreground">Bank data is excluded.</span> Bank data needs separate consent even when it appears in a chat or upload. Maal doesn't ask for that consent today. Chats and files with unclear data origins are excluded.</li>
            <li><span className="font-semibold text-foreground">Never sold.</span> Your data isn't sold or used for advertising.</li>
          </ul>
          <a href="/ai-transparency" className="inline-block mt-4 text-[13px] font-medium underline underline-offset-2">
            How Maal uses AI →
          </a>
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground mb-3">Security</h2>
        <div className="rounded-[14px] border border-border bg-[var(--surface)] divide-y divide-border">
          {SECURITY_POINTS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-3.5 p-5">
              <Icon className="size-4 mt-0.5 shrink-0" />
              <div>
                <p className="text-[14px] font-semibold">{title}</p>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
        <a href="/security" className="inline-block mt-4 text-[13px] font-medium underline underline-offset-2">
          Read our security page →
        </a>
      </section>
    </div>
  );
}
