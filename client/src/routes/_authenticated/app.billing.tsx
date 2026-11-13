import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CreditCard, Check, Sparkles, Clock } from "lucide-react";
import { z } from "zod";
import { getUsage, type Usage } from "@/lib/usage.functions";
import { InviteFriendsCard } from "@/components/maal/app/InviteFriendsCard";

const searchSchema = z.object({
  billing: z.enum([
    "success", "cancel", "demo", "downgraded", "cancel_scheduled",
    "error", "error_config", "error_stripe",
  ]).optional(),
  plan: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/app/billing")({
  component: BillingPage,
  validateSearch: searchSchema,
});

const FEATURE_LABELS: Record<string, string> = {
  advisor_messages: "Ask Maal messages",
  research_runs: "Research reports",
  active_radars: "Active radars",
  ai_files: "AI file exports",
};

const BANNERS: Record<string, { tone: "good" | "bad"; text: string }> = {
  success: { tone: "good", text: "Payment received. Welcome to Maal, your membership is active." },
  demo: { tone: "good", text: "Plan updated (demo mode, no payment was taken)." },
  downgraded: { tone: "good", text: "Your membership has ended." },
  cancel_scheduled: { tone: "good", text: "Your subscription will end when the current billing period finishes. You keep full access until then." },
  cancel: { tone: "bad", text: "Checkout was cancelled, so your plan hasn't changed." },
  error: { tone: "bad", text: "Something went wrong with checkout. Your plan hasn't changed, please try again." },
  // Distinct codes so a misconfigured deploy doesn't look like a user error.
  error_config: { tone: "bad", text: "Payments aren't fully configured yet, so checkout couldn't start. Nothing was charged. Please contact support." },
  error_stripe: { tone: "bad", text: "Stripe couldn't start the checkout session. Nothing was charged, please try again shortly." },
};

function BillingPage() {
  const search = useSearch({ from: "/_authenticated/app/billing" });
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUsage()
      .then((u) => { setUsage(u); })
      .catch(() => { /* fall through to the "couldn't load" state */ })
      .finally(() => { setLoading(false); });
  }, []);

  const plan = usage?.plan ?? "free";
  const banner = search.billing ? BANNERS[search.billing] : null;

  return (
    <div className="max-w-4xl mx-auto px-6 md:px-10 py-10">
      <div className="flex items-center gap-2.5 mb-1">
        <CreditCard className="size-5" />
        <h1 className="text-[22px] font-bold tracking-display">Plan &amp; Usage</h1>
      </div>
      <p className="text-[13px] text-muted-foreground mb-6">
        Your membership and usage. Monthly usage resets on the 1st of each month.
      </p>

      {banner && (
        <div className={`mb-6 px-4 py-3 rounded-[10px] border text-[13px] font-medium ${banner.tone === "good" ? "border-mint/40 bg-mint/10" : "border-red-500/40 bg-red-500/10"}`}>
          {banner.text}
        </div>
      )}

      {/* Usage */}
      <section className="mb-8">
        <h2 className="text-[15px] font-bold tracking-display mb-3">Your usage</h2>
        <div className="rounded-[14px] border border-border bg-[var(--surface)] p-5">
          {loading ? (
            <p className="text-[13px] text-muted-foreground">Loading usage…</p>
          ) : !usage ? (
            <p className="text-[13px] text-muted-foreground">Couldn't load usage right now.</p>
          ) : (
            <>
              <ul className="space-y-4">
                {Object.entries(usage.features).map(([key, f]) => {
                  const label = FEATURE_LABELS[key] ?? key;
                  const concurrent = key === "active_radars";
                  // limit === null: the number is deliberately not shown (member chat cap).
                  const hidden = f.limit === null;
                  const lim = f.limit ?? 0;
                  const pct = lim > 0 ? Math.min(100, Math.round((f.used / lim) * 100)) : 0;
                  return (
                    <li key={key}>
                      <div className="flex items-baseline justify-between text-[13px]">
                        <span className="font-medium">
                          {label}
                          {concurrent && <span className="ml-1.5 text-[11px] text-muted-foreground">(currently active)</span>}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {hidden ? `${f.used} this month` : lim > 0 ? `${f.used} / ${lim}` : "Paused"}
                        </span>
                      </div>
                      <div className="h-1.5 bg-[var(--secondary)] rounded-full overflow-hidden mt-1.5">
                        <div
                          className={`h-full rounded-full ${hidden ? "bg-foreground/30" : lim === 0 ? "bg-border" : pct >= 90 ? "bg-red-500" : "bg-foreground"}`}
                          style={{ width: hidden ? "100%" : lim > 0 ? `${pct}%` : "100%" }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[12px] text-muted-foreground mt-4">
                Usage resets on {usage.resetsOn}. Active radars counts radars running right now; pause or delete one to free a slot.
              </p>
            </>
          )}
        </div>
      </section>

      {/* Membership */}
      <section>
        <h2 className="text-[15px] font-bold tracking-display mb-3">Membership</h2>
        {usage && <MembershipCard usage={usage} />}
      </section>

      {/* Referrals */}
      <section className="mt-8">
        <h2 className="text-[15px] font-bold tracking-display mb-3">Invite friends</h2>
        <InviteFriendsCard />
      </section>
    </div>
  );
}

const MEMBER_FEATURES = [
  "Access to AI chat with Ask Maal",
  "Your Maal Score, plan and net worth in one place",
  "Connect banks, super, property, crypto and debt",
  "Research reports and Radar alerts",
  "Profit-based investment options from partners (coming soon, general information only)",
];

function MembershipCard({ usage }: { usage: Usage }) {
  const { basePlan, paid, trial, offer } = usage;
  const legacy = basePlan === "pro" || basePlan === "max";

  const status = paid
    ? legacy
      ? `You're on the ${basePlan === "pro" ? "Pro" : "Max"} plan. It's no longer sold, and you keep it for as long as you stay subscribed.`
      : `You're a Maal member. Your membership renews at ${offer.renewal}/year.`
    : trial?.active
      ? `Free trial: ${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left. Join any time to keep everything when it ends.`
      : "Your free trial has ended. Join to keep using Maal.";

  return (
    <div className={`rounded-[14px] border p-5 bg-[var(--surface)] ${paid ? "border-foreground" : "border-border"}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-bold tracking-display">Maal Membership</h3>
        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[var(--secondary)] inline-flex items-center gap-1">
          {paid ? "Active" : trial?.active ? (<><Clock className="size-3" /> Trial</>) : "Trial ended"}
        </span>
      </div>
      <p className="mt-2 text-[13px]">{status}</p>

      {!paid && (
        <>
          <p className="mt-3 text-[26px] font-bold tracking-display">
            {offer.firstYear}
            <span className="text-[12px] font-medium text-muted-foreground"> AUD for your first year</span>
          </p>
          <p className="text-[12px] text-muted-foreground">Then {offer.renewal}/year, renewing automatically. Cancel anytime.</p>
        </>
      )}

      <ul className="mt-4 space-y-1.5">
        {MEMBER_FEATURES.map((f) => (
          <li key={f} className="flex items-start gap-1.5 text-[12.5px]">
            <Check className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" /> {f}
          </li>
        ))}
      </ul>

      <div className="mt-5">
        {paid ? (
          <form method="post" action="/billing/downgrade">
            <button type="submit" className="w-full md:w-auto px-4 py-2 rounded-[10px] border border-border text-[13px] font-semibold hover:border-foreground transition-colors">
              Cancel at period end
            </button>
          </form>
        ) : (
          <form method="post" action="/billing/checkout">
            <input type="hidden" name="plan" value="member" />
            <button type="submit" className="w-full md:w-auto px-5 py-2.5 rounded-[10px] bg-foreground text-background text-[13px] font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5">
              <Sparkles className="size-3.5" /> Join for {offer.firstYear}
            </button>
          </form>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mt-4">
        Billed yearly in AUD via Stripe. {paid ? "Cancelling keeps your access until the end of the year you've paid for." : `${offer.line}`}
      </p>
    </div>
  );
}
