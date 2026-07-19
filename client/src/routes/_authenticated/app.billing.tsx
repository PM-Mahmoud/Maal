import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CreditCard, Check, Sparkles } from "lucide-react";
import { z } from "zod";
import { getUsage, type Usage } from "@/lib/usage.functions";

const searchSchema = z.object({
  billing: z.enum(["success", "cancel", "demo", "downgraded", "error"]).optional(),
  plan: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/app/billing")({
  component: BillingPage,
  validateSearch: searchSchema,
});

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    blurb: "Track everything, no AI",
    features: ["Dashboard, net worth & Maal Score", "Assets, transactions, goals & vault", "Manual + Basiq account linking", "AI features locked"],
  },
  {
    key: "pro",
    name: "Pro",
    price: "$20",
    blurb: "The full advisor experience",
    features: ["500 Ask Maal messages / month", "10 research reports / month", "10 active radars", "10 AI file exports / month"],
  },
  {
    key: "max",
    name: "Max",
    price: "$200",
    blurb: "For complex finances",
    features: ["1,000 Ask Maal messages / month", "50 research reports / month", "50 active radars", "100 AI file exports / month"],
  },
] as const;

const FEATURE_LABELS: Record<string, string> = {
  advisor_messages: "Ask Maal messages",
  research_runs: "Research reports",
  active_radars: "Active radars",
  ai_files: "AI file exports",
};

// Tier ordering used to distinguish upgrades from downgrades.
const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, max: 2 };

const BANNERS: Record<string, { tone: "good" | "bad"; text: string }> = {
  success: { tone: "good", text: "Payment received — your plan is now active. Welcome aboard!" },
  demo: { tone: "good", text: "Plan updated (demo mode — no payment was taken)." },
  downgraded: { tone: "good", text: "You're back on the Free plan." },
  cancel: { tone: "bad", text: "Checkout was cancelled — your plan hasn't changed." },
  error: { tone: "bad", text: "Something went wrong with checkout. Your plan hasn't changed — please try again." },
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
        Your subscription and AI usage. Monthly quotas reset on the 1st of each month; active radars are a live concurrent limit.
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
              {plan === "free" && (
                <div className="mb-4 px-4 py-3 rounded-[10px] border border-border bg-[var(--secondary)] text-[13px]">
                  <span className="font-semibold">You're on Free.</span> Ask Maal, Research and Radar are part of Pro — everything else stays free.
                </div>
              )}
              <ul className="space-y-4">
                {Object.entries(usage.features).map(([key, f]) => {
                  const label = FEATURE_LABELS[key] ?? key;
                  const concurrent = key === "active_radars";
                  const pct = f.limit > 0 ? Math.min(100, Math.round((f.used / f.limit) * 100)) : 0;
                  return (
                    <li key={key}>
                      <div className="flex items-baseline justify-between text-[13px]">
                        <span className="font-medium">
                          {label}
                          {concurrent && <span className="ml-1.5 text-[11px] text-muted-foreground">(currently active)</span>}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {f.limit > 0 ? `${f.used} / ${f.limit}` : "Locked on Free"}
                        </span>
                      </div>
                      <div className="h-1.5 bg-[var(--secondary)] rounded-full overflow-hidden mt-1.5">
                        <div
                          className={`h-full rounded-full ${f.limit === 0 ? "bg-border" : pct >= 90 ? "bg-red-500" : "bg-foreground"}`}
                          style={{ width: f.limit > 0 ? `${pct}%` : "100%" }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[12px] text-muted-foreground mt-4">
                Monthly quotas reset on {usage.resetsOn}. Active radars is a concurrent limit — pause or delete a radar to free a slot.
              </p>
            </>
          )}
        </div>
      </section>

      {/* Plans */}
      <section>
        <h2 className="text-[15px] font-bold tracking-display mb-3">Plans</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {PLANS.map((p) => {
            const current = p.key === plan;
            const currentRank = PLAN_RANK[plan] ?? 0;
            const targetRank = PLAN_RANK[p.key];
            const isUpgrade = !current && targetRank > currentRank;
            // Paid→paid downgrades (e.g. Max → Pro) have no supported endpoint:
            // /billing/downgrade always lands on Free, and /billing/checkout
            // would open a SECOND subscription alongside the current one.
            // Never route those through checkout — offer a support request.
            const isPaidDowngrade = !current && p.key !== "free" && targetRank < currentRank;
            return (
              <div key={p.key} className={`rounded-[14px] border p-5 bg-[var(--surface)] flex flex-col ${current ? "border-foreground" : "border-border"}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] font-bold tracking-display">{p.name}</h3>
                  {current && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[var(--secondary)]">Current</span>
                  )}
                </div>
                <p className="mt-1 text-[22px] font-bold tracking-display">
                  {p.price}
                  <span className="text-[12px] font-medium text-muted-foreground"> AUD/mo</span>
                </p>
                <p className="text-[12px] text-muted-foreground">{p.blurb}</p>
                <ul className="mt-3 space-y-1.5 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[12.5px]">
                      <Check className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" /> {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  {current ? (
                    p.key !== "free" ? (
                      <form method="post" action="/billing/downgrade">
                        <button type="submit" className="w-full px-4 py-2 rounded-[10px] border border-border text-[13px] font-semibold hover:border-foreground transition-colors">
                          Downgrade to Free
                        </button>
                      </form>
                    ) : (
                      <div className="w-full px-4 py-2 rounded-[10px] border border-transparent text-[13px] text-center text-muted-foreground">Your plan</div>
                    )
                  ) : p.key === "free" ? (
                    <form method="post" action="/billing/downgrade">
                      <button type="submit" className="w-full px-4 py-2 rounded-[10px] border border-border text-[13px] font-semibold hover:border-foreground transition-colors">
                        Switch to Free
                      </button>
                    </form>
                  ) : isUpgrade ? (
                    <form method="post" action="/billing/checkout">
                      <input type="hidden" name="plan" value={p.key} />
                      <button type="submit" className="w-full px-4 py-2 rounded-[10px] bg-foreground text-background text-[13px] font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5">
                        <Sparkles className="size-3.5" /> Upgrade to {p.name}
                      </button>
                    </form>
                  ) : (
                    // Paid → lower-paid tier (e.g. Max → Pro): no change-plan
                    // endpoint exists, so don't send the user through checkout
                    // (which would bill a second subscription).
                    <a
                      href={`mailto:support@maal.app?subject=${encodeURIComponent(`Plan change request: ${plan} to ${p.key}`)}`}
                      className="w-full px-4 py-2 rounded-[10px] border border-border text-[13px] font-semibold hover:border-foreground transition-colors inline-flex items-center justify-center"
                    >
                      Request switch to {p.name}
                    </a>
                  )}
                </div>
                {isPaidDowngrade && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Plan downgrades between paid tiers are handled by support so your billing is adjusted, not duplicated.
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-4">
          Subscriptions are billed monthly in AUD via Stripe and can be cancelled any time. Downgrading takes effect immediately.
        </p>
      </section>
    </div>
  );
}
