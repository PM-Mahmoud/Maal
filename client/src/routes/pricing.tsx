import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Minus } from "lucide-react";
import { SiteHeader } from "@/components/maal/SiteHeader";
import { SiteFooter } from "@/components/maal/SiteFooter";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Maal" },
      { name: "description", content: "Free, Pro $20/mo, and Max $200/mo. Honest pricing for a CFO-level financial advisor built for Australians." },
      { property: "og:title", content: "Pricing — Maal" },
      { property: "og:description", content: "Free, Pro $20/mo, and Max $200/mo. Honest pricing for Australians." },
    ],
  }),
  component: PricingPage,
});

const features: Array<{ label: string; free: boolean | string; pro: boolean | string; max: boolean | string }> = [
  { label: "Maal Score (0–100)", free: true, pro: true, max: true },
  { label: "Manual asset & debt entry", free: true, pro: true, max: true },
  { label: "Ethical Score (ESG + Islamic screens)", free: false, pro: true, max: true },
  { label: "Open banking sync", free: false, pro: true, max: true },
  { label: "Retirement projections (Monte Carlo)", free: false, pro: true, max: true },
  { label: "Ask Maal advisor chat", free: false, pro: true, max: true },
  { label: "Goals & portfolio plan", free: false, pro: true, max: true },
  { label: "Radar alerts (email + SMS)", free: false, pro: false, max: true },
  { label: "Vault PDF extraction", free: false, pro: false, max: true },
  { label: "Multi-entity (trusts, companies)", free: false, pro: false, max: true },
  { label: "Priority human-led reviews", free: false, pro: false, max: true },
];

function PricingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="pt-20 pb-12">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-4">Pricing</p>
            <h1 className="text-[44px] md:text-[56px] tracking-display font-bold leading-[1.05]">
              Pay for clarity, not for advice.
            </h1>
            <p className="mt-5 text-[16px] text-muted-foreground max-w-xl mx-auto">
              Maal replaces the spreadsheet and the awkward annual review. Cancel anytime. All amounts in AUD.
            </p>
          </div>
        </section>

        <section className="pb-16">
          <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-3 gap-4">
            <Tier name="Free" price="$0" per="forever" cta="Start free" to="/auth"
              desc="Get your score and try the dashboard."
              highlights={["Maal Score", "Manual entry", "Basic dashboard"]} />
            <Tier name="Pro" price="$20" per="AUD / month" cta="Get Pro" to="/auth" featured
              desc="The full advisor — for every Australian household."
              highlights={["Everything in Free", "Open banking sync", "Ethical screens", "Ask Maal chat", "Retirement projections"]} />
            <Tier name="Max" price="$200" per="AUD / month" cta="Talk to us" to="/waitlist"
              desc="For complex finances and small business owners."
              highlights={["Everything in Pro", "Radar alerts (email + SMS)", "Vault PDF extraction", "Multi-entity", "Priority reviews"]} />
          </div>
        </section>

        <section className="py-20 border-t border-border bg-[var(--secondary)]/30">
          <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-[24px] md:text-[28px] tracking-display font-bold mb-10">Feature comparison</h2>
            <div className="bg-[var(--surface)] border border-border rounded-[14px] overflow-hidden">
              <div className="grid grid-cols-[1.5fr_repeat(3,1fr)] text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-border">
                <div className="px-5 py-4">Feature</div>
                <div className="px-5 py-4 text-center">Free</div>
                <div className="px-5 py-4 text-center">Pro</div>
                <div className="px-5 py-4 text-center">Max</div>
              </div>
              {features.map((f, i) => (
                <div
                  key={f.label}
                  className={
                    "grid grid-cols-[1.5fr_repeat(3,1fr)] text-[13px] items-center " +
                    (i < features.length - 1 ? "border-b border-border " : "")
                  }
                >
                  <div className="px-5 py-3.5">{f.label}</div>
                  <Cell value={f.free} />
                  <Cell value={f.pro} />
                  <Cell value={f.max} />
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <div className="px-5 py-3.5 text-center text-foreground">{value}</div>;
  }
  return (
    <div className="px-5 py-3.5 flex justify-center">
      {value ? <Check className="size-4 text-[var(--mint)]" /> : <Minus className="size-4 text-muted-foreground/40" />}
    </div>
  );
}

function Tier({
  name, price, per, cta, to, desc, highlights, featured = false,
}: {
  name: string; price: string; per: string; cta: string; to: string;
  desc: string; highlights: string[]; featured?: boolean;
}) {
  return (
    <div className={"p-8 rounded-[14px] bg-[var(--surface)] flex flex-col border " + (featured ? "border-foreground" : "border-border")}>
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{name}</h3>
        {featured && <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--mint)]">Recommended</span>}
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-[44px] font-bold tracking-display tabular-nums">{price}</span>
        <span className="text-[12px] text-muted-foreground">{per}</span>
      </div>
      <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed">{desc}</p>
      <ul className="mt-6 space-y-2.5 flex-1">
        {highlights.map((h) => (
          <li key={h} className="flex items-start gap-2 text-[13px]">
            <Check className="size-3.5 text-[var(--mint)] mt-1 shrink-0" />
            <span>{h}</span>
          </li>
        ))}
      </ul>
      <Link
        to={to}
        className={
          "mt-7 inline-flex items-center justify-center px-4 py-2.5 rounded-[8px] text-[13px] font-semibold transition-all " +
          (featured ? "bg-foreground text-background hover:bg-foreground/90" : "border border-border hover:bg-[var(--secondary)]")
        }
      >
        {cta}
      </Link>
    </div>
  );
}