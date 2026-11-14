import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { getReferrals, type ReferralSummary } from "@/lib/referrals.functions";
import { useCopyLink } from "./useCopyLink";

// Onboarding step: "Refer 3 friends, renew for $4.99."
// Figma lYCk0dAcbGQGZt96GzU9ui frame 08 + GHaUsikdoHV310Ao6IjyMO frames 3:2
// ("Copy link") and 3:6 ("Link copied"). Uses the member's real referral link
// from GET /api/v1/referrals (routes/referrals.js → /r/<code>). Reward rules
// live in lib/referrals.js; the copy below must stay in step with them.

const SHARE_TEXT = "I'm using Maal to get on top of my money. Here's my invite, so you can skip the waitlist:";

const STEPS = [
  { title: "Share your unique link", body: "Send it to friends who aren’t on Maal yet. It lets them skip the waitlist." },
  { title: "They join for $4.99", body: "They start with a 14-day free trial, no card needed, then their first year is $4.99." },
  { title: "You get rewarded", body: "When 3 of them become members, your next yearly renewal is $4.99 instead of $49.99." },
];

export function ReferFriendsStep() {
  const [data, setData] = useState<ReferralSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const { copied, copy } = useCopyLink();

  useEffect(() => {
    let live = true;
    getReferrals()
      .then((d) => { if (!live) return; setData(d); setFailed(!d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  const copyLink = async () => {
    if (!data) return;
    if (!(await copy(data.link))) toast.error("Couldn’t copy your link. Try again, or copy it from Plan & Usage later.");
  };

  const share = async () => {
    if (!data) return;
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title: "Join me on Maal", text: SHARE_TEXT, url: data.link }); return; }
      catch (e) { if ((e as DOMException)?.name === "AbortError") return; /* else fall back to copying */ }
    }
    await copyLink();
  };

  return (
    <div className="wl-col wl-col-wide">
      <section className="wl-offer" aria-labelledby="wl-offer-h">
        <span className="wl-offer-badge">Limited time offer</span>
        <h1 id="wl-offer-h" className="wl-offer-h">Refer 3 friends,<br />renew for $4.99.</h1>
        <p className="wl-offer-sub">Your friends skip the waitlist and get on top of their money. You get rewarded.</p>
      </section>

      <h2 className="wl-howto">How it works</h2>
      <ol className="wl-timeline">
        {STEPS.map((s) => (
          <li key={s.title}>
            <span className="wl-step-dot" aria-hidden="true"><Check className="size-3.5" strokeWidth={2.5} /></span>
            <b>{s.title}</b>
            <span>{s.body}</span>
          </li>
        ))}
      </ol>

      <div className="wl-ref-actions">
        <button type="button" className="v2-btn v2-btn-ink v2-btn-lg v2-btn-block wl-ref-btn" onClick={share} disabled={!data}>
          Refer your friends
        </button>
        <button
          type="button"
          className={`v2-btn v2-btn-line v2-btn-block wl-ref-btn wl-copy${copied ? " is-copied" : ""}`}
          onClick={copyLink}
          disabled={!data}
          aria-label={copied ? "Link copied" : "Copy your unique link"}
        >
          <span>{copied ? "Link copied" : "Copy unique link"}</span>
          {copied ? <Check className="size-5" aria-hidden="true" /> : <Copy className="size-[18px]" aria-hidden="true" />}
        </button>
        <span className="sr-only" role="status" aria-live="polite">{copied ? "Your referral link is copied to the clipboard." : ""}</span>
      </div>

      {data && data.signedUp > 0 && (
        <p className="wl-ref-progress">{data.towardsNext} of {data.needed} friends have become members so far.</p>
      )}
      {failed && (
        <p className="wl-ref-progress" role="status">We couldn’t load your link just now. You’ll find it any time under Plan &amp; Usage.</p>
      )}

      <button type="button" className="wl-skip-link wl-terms-link" aria-expanded={showTerms} aria-controls="wl-ref-terms" onClick={() => setShowTerms((v) => !v)}>
        Terms and conditions
      </button>
      {showTerms && (
        <ul id="wl-ref-terms" className="wl-terms">
          <li>The reward is a $4.99 renewal (instead of $49.99) on your next yearly Maal Membership renewal.</li>
          <li>It counts friends who sign up with your link and pay for a membership. Refunded memberships don’t count.</li>
          <li>Each link can let up to 20 people skip the waitlist.</li>
          <li>Rewards have no cash value and can’t be transferred. Maal may change or end this offer at any time.</li>
        </ul>
      )}
    </div>
  );
}
