import { useEffect, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { Bell, Check } from "lucide-react";
import { COMING_SOON, type ComingSoonFeature, type ComingSoonKey } from "./features";
import { hasNotified, registerServiceInterest, rememberNotified } from "./interest";
import "../nav/nav.css";
import "./coming-soon.css";

/**
 * One "Coming soon" page for every feature that isn't live yet (2026-11-23):
 * title bar, an in-repo illustration built around the feature's icon, a
 * "Coming soon" pill, a Lora headline, one line, three benefits and a
 * "Notify me" button. The shell footer carries the disclaimer.
 */
export function ComingSoonPage({ feature }: { feature: ComingSoonKey }) {
  const f = COMING_SOON[feature];
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");

  // Read after mount so server/first render and storage-less browsers agree.
  useEffect(() => { setState(hasNotified(f.key) ? "done" : "idle"); }, [f.key]);

  async function notify() {
    setState("sending");
    try {
      await registerServiceInterest(f.key);
      rememberNotified(f.key);
      setState("done");
      toast.success(`Thanks. We'll let you know when ${f.title} is ready.`);
    } catch (e) {
      setState("idle");
      toast.error(e instanceof Error ? e.message : "Couldn't save that. Please try again.");
    }
  }

  const style = { "--cs-a": f.colours[0], "--cs-b": f.colours[1] } as CSSProperties;

  return (
    <div className="cs-root" style={style}>
      <header className="mn-tabs cs-head">
        <h1 className="mn-tabs-title cs-title">{f.title}</h1>
      </header>
      <section className="cs-col" aria-labelledby={`cs-${f.key}-headline`}>
        <Illustration feature={f} />
        <span className="cs-pill">Coming soon</span>
        <h2 id={`cs-${f.key}-headline`} className="cs-headline">{f.headline}</h2>
        <p className="cs-promise">{f.promise}</p>
        <ul className="cs-benefits">
          {f.benefits.map(({ icon: Icon, label }) => (
            <li key={label} className="cs-benefit">
              <span className="cs-benefit-icon"><Icon aria-hidden strokeWidth={1.6} /></span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="mn-btn cs-btn" onClick={notify} disabled={state !== "idle"}
          aria-live="polite">
          {state === "done"
            ? <><Check aria-hidden className="size-4" /> We'll let you know</>
            : state === "sending"
              ? "Saving…"
              : <><Bell aria-hidden className="size-4" /> Notify me</>}
        </button>
      </section>
    </div>
  );
}

/** Soft abstract shapes around a card holding the feature's icon. Inline SVG, no external art. */
function Illustration({ feature }: { feature: ComingSoonFeature }) {
  const Icon = feature.icon;
  return (
    <div className="cs-art" aria-hidden>
      <svg viewBox="0 0 240 180" className="cs-art-svg" focusable="false">
        <circle cx="120" cy="92" r="74" fill="var(--cs-a)" opacity=".14" />
        <circle cx="120" cy="92" r="52" fill="var(--cs-a)" opacity=".12" />
        <circle cx="178" cy="52" r="26" fill="var(--cs-b)" opacity=".32" />
        <circle cx="62" cy="134" r="18" fill="var(--cs-a)" opacity=".28" />
        <circle cx="52" cy="58" r="6" fill="var(--cs-b)" opacity=".7" />
        <circle cx="196" cy="128" r="4" fill="var(--cs-a)" opacity=".7" />
        <circle cx="34" cy="98" r="3" fill="var(--cs-a)" opacity=".5" />
        <path d="M200 92 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="var(--cs-b)" opacity=".8" />
        <path d="M78 30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="var(--cs-a)" opacity=".6" />
      </svg>
      <span className="cs-art-card"><Icon strokeWidth={1.6} /></span>
    </div>
  );
}
