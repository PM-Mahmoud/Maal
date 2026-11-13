import { useEffect, useState, type ReactNode } from "react";
import { Clock, Sparkles } from "lucide-react";
import { getUsage, type Usage } from "@/lib/usage.functions";

// Trial banner + paywall (specs/onboarding-v2-membership.md, PR 4).
// - During the 14-day trial: a slim "x days left" banner with a Join button.
// - After the trial without paying (usage.paywalled): the page renders blurred
//   and non-interactive behind a card offering membership. It can't be closed;
//   the only way through is checkout (or Plan & Usage / sign out).
export function MembershipGate({ children }: { children: ReactNode }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => { getUsage().then(setUsage).catch(() => setUsage(null)); }, []);

  const paywalled = !!usage?.paywalled;
  const trial = usage?.trial;

  return (
    <>
      {usage && !usage.paid && trial?.active && (
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-10 pt-4">
          <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border bg-[var(--surface)] px-4 py-2.5 text-[13px]">
            <Clock className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 min-w-[200px]">
              <span className="font-semibold">{trial.daysLeft} day{trial.daysLeft === 1 ? "" : "s"} left in your free trial.</span>{" "}
              <span className="text-muted-foreground">Keep everything for {usage.offer.firstYear} for your first year, then {usage.offer.renewal}/year.</span>
            </span>
            <JoinButton label={`Join for ${usage.offer.firstYear}`} small />
          </div>
        </div>
      )}

      <div className="relative">
        <div
          aria-hidden={paywalled || undefined}
          // `inert` keeps keyboard/screen-reader users out of the blurred page too.
          inert={paywalled || undefined}
          style={paywalled ? { filter: "blur(6px)", pointerEvents: "none", userSelect: "none" } : undefined}
        >
          {children}
        </div>

        {paywalled && usage && (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/30" role="dialog" aria-modal="true" aria-labelledby="paywall-title">
            <div className="w-full max-w-[440px] rounded-[18px] p-7 text-center text-white shadow-2xl"
              style={{ background: "radial-gradient(80% 50% at 50% 115%, rgba(110,150,180,.45), rgba(110,150,180,0) 70%), linear-gradient(180deg, #0C1218, #18222C)", fontFamily: "Inter, system-ui, sans-serif" }}>
              <p className="text-[11px] uppercase tracking-[.08em] text-white/80">Your free trial has ended · Join Maal today</p>
              <span className="inline-block mt-4 px-3 py-1 rounded-[6px] text-[13px] bg-[#1191A9] text-white">Limited time offer</span>
              <h2 id="paywall-title" className="mt-3 text-[64px] leading-none" style={{ fontFamily: "Lora, Georgia, serif" }}>{usage.offer.firstYear}</h2>
              <p className="mt-2 text-[24px]" style={{ fontFamily: "Lora, Georgia, serif" }}>for your first year</p>
              <p className="mt-3 text-[13px] text-white/75">Then {usage.offer.renewal}/year. Cancel anytime in Plan &amp; Usage.</p>
              <div className="mt-6 flex justify-center"><JoinButton label="Join today" /></div>
              <a href="/app/billing" className="mt-4 inline-block text-[12px] text-white/80 underline underline-offset-2">See what's included</a>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function JoinButton({ label, small }: { label: string; small?: boolean }) {
  return (
    <form method="post" action="/billing/checkout">
      <input type="hidden" name="plan" value="member" />
      <button
        type="submit"
        className={small
          ? "px-3.5 py-1.5 rounded-[9px] bg-foreground text-background text-[12.5px] font-semibold hover:opacity-90 inline-flex items-center gap-1.5"
          : "px-8 py-3 rounded-[6px] bg-white text-[#101010] text-[14px] font-normal hover:bg-white/90 inline-flex items-center justify-center gap-1.5"}
      >
        {small && <Sparkles className="size-3.5" />} {label}
      </button>
    </form>
  );
}
