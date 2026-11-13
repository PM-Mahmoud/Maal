import { useEffect, useState } from "react";
import { Gift, Copy, Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { getReferrals, type ReferralSummary } from "@/lib/referrals.functions";

// "Refer 3 friends, renew for $4.99" — the member's link and progress.
// Reused by the onboarding referral step (onboarding v2, PR 4).
export function InviteFriendsCard() {
  const [data, setData] = useState<ReferralSummary | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getReferrals().then(setData).catch(() => setData(null));
  }, []);

  if (!data) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  };

  const share = async () => {
    const text = "I'm using Maal to get on top of my money. Here's my invite, so you can skip the waitlist:";
    if (navigator.share) {
      try { await navigator.share({ title: "Join me on Maal", text, url: data.link }); } catch { /* cancelled */ }
    } else {
      await copy();
    }
  };

  const reward =
    data.rewardStatus === "applied"
      ? "Your next renewal is $4.99. Thanks for spreading the word!"
      : data.rewardStatus === "pending"
        ? "You've earned a $4.99 renewal. It's added to your membership when you join."
        : `${data.towardsNext} of ${data.needed} friends have joined.`;

  return (
    <div className="rounded-[14px] border border-border p-5 bg-[var(--surface)]">
      <div className="flex items-center gap-2">
        <Gift className="size-4" />
        <h3 className="text-[15px] font-bold tracking-display">Refer 3 friends, renew for $4.99</h3>
      </div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Your link lets friends skip the waitlist. When 3 of them become members, your next yearly renewal is $4.99 instead of $49.99.
      </p>

      <div className="mt-4 flex gap-1.5" aria-label={`${data.towardsNext} of ${data.needed} friends joined`}>
        {Array.from({ length: data.needed }).map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i < data.towardsNext ? "bg-foreground" : "bg-[var(--secondary)]"}`} />
        ))}
      </div>
      <p className="mt-2 text-[12.5px] font-medium">{reward}</p>

      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <input
          readOnly
          value={data.link}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 px-3 py-2 rounded-[10px] border border-border bg-transparent text-[13px] tabular-nums"
          aria-label="Your referral link"
        />
        <button type="button" onClick={copy} className="px-4 py-2 rounded-[10px] border border-border text-[13px] font-semibold hover:border-foreground transition-colors inline-flex items-center justify-center gap-1.5">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copy link
        </button>
        <button type="button" onClick={share} className="px-4 py-2 rounded-[10px] bg-foreground text-background text-[13px] font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5">
          <Share2 className="size-3.5" /> Share
        </button>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        {data.signedUp} signed up with your link so far. Each link can let in up to 20 people. Rewards count friends who pay, not refunds.
      </p>
    </div>
  );
}
