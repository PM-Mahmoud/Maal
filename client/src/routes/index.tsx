import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/maal/SiteHeader";
import { SiteFooter } from "@/components/maal/SiteFooter";
import { Reveal } from "@/components/maal/Reveal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Maal — Financial clarity for every Australian" },
      { name: "description", content: "Maal reads your assets, debts, super, and income to deliver a 0–100 Financial Health Score and a personalised action plan. CFO-level clarity, no advisor required." },
      { property: "og:title", content: "Maal — Financial clarity for every Australian" },
      { property: "og:description", content: "Maal reads your assets, debts, super, and income to deliver a 0–100 Financial Health Score and a personalised action plan." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Reveal><ScoreCard /></Reveal>
        <Reveal><PrinciplesStrip /></Reveal>
        <Reveal><Products /></Reveal>
        <Reveal><HowItWorks /></Reveal>
        <Reveal><WhyMaal /></Reveal>
        <Reveal><PricingStrip /></Reveal>
        <Reveal><Cta /></Reveal>
      </main>
      <SiteFooter />
    </div>
  );
}

function Hero() {
  return (
    <section className="pt-16 pb-10 md:pt-24 md:pb-14">
      <div className="max-w-3xl mx-auto px-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-6">
          Built for Australia
        </p>
        <h1 className="text-[52px] md:text-[80px] leading-[0.98] tracking-display font-bold text-balance">
          Your money,<br />in balance.
        </h1>
        <p className="mt-7 text-[17px] md:text-[19px] text-muted-foreground leading-relaxed max-w-[58ch] text-pretty">
          Maal is the all-in-one for everyday Australians — a CFO-level advisor that reads your statements,
          bank accounts and transactions, then explains your financial situation in plain language.
          Super, HECS, portfolio, spending: one clear picture.
        </p>
        <div className="mt-9 flex flex-wrap gap-3 items-center">
          <Link to="/score" className="bg-foreground text-background px-5 py-3 rounded-[8px] text-[14px] font-semibold hover:bg-foreground/90 active:scale-[0.98] transition-all">
            Get your score free
          </Link>
          <Link to="/auth" className="text-[14px] font-semibold text-foreground hover:text-foreground/70 px-2">
            Log in →
          </Link>
        </div>
        <p className="mt-5 text-[12px] text-muted-foreground">
          Free to start. No card required. Read-only bank connections via Basiq.
        </p>
      </div>
    </section>
  );
}

function ScoreCard() {
  return (
    <section className="pb-16 md:pb-20">
      <div className="max-w-3xl mx-auto px-6">
        <div className="shimmer-overlay hover-lift rounded-[18px] border border-border bg-[var(--surface)] p-7 md:p-8 shadow-[0_30px_60px_-30px_rgba(14,14,16,0.12)]">
          <div className="flex items-start justify-between gap-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Financial wellbeing score
            </p>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--mint)] bg-[var(--mint)]/10 border border-[var(--mint)]/25 rounded-full px-2.5 py-1">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.5 2.5L9.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              On track
            </span>
          </div>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="text-[64px] md:text-[80px] font-bold tracking-display tabular-nums leading-none">82</span>
            <span className="text-[20px] text-muted-foreground tabular-nums">/ 100</span>
          </div>
          <div className="mt-5 h-[6px] rounded-full bg-[var(--secondary)] overflow-hidden">
            <div
              className="h-full bg-foreground rounded-full"
              style={{ width: "82%", transition: "width 1400ms cubic-bezier(.2,.7,.2,1)" }}
            />
          </div>
          <div className="mt-6 space-y-3">
            {[
              { label: "Credit Score", value: "742 / 1,200", dot: "bg-foreground" },
              { label: "Debt Score", value: "68 / 100", dot: "bg-[var(--mint)]" },
              { label: "Super & Retirement", value: "78%", dot: "bg-foreground" },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2.5">
                  <span className={"size-1.5 rounded-full " + r.dot} />
                  <span className="text-foreground">{r.label}</span>
                </span>
                <span className="tabular-nums text-foreground font-medium">{r.value}</span>
              </div>
            ))}
          </div>
          <p className="mt-6 pt-5 border-t border-border text-center text-[12px] text-muted-foreground">
            Your values. Your framework. Your score.
          </p>
        </div>
      </div>
    </section>
  );
}

function PrinciplesStrip() {
  const items = [
    { big: "3 scores", small: "Credit, debt & financial wellbeing" },
    { big: "100+ institutions", small: "Connected via Basiq open banking" },
    { big: "Built for AU", small: "Super, HECS & ATO native" },
    { big: "Read-only", small: "Maal can never move your money" },
  ];
  return (
    <section className="py-14 md:py-20 border-y border-border bg-[var(--secondary)]/40">
      <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-10 text-center">
        {items.map((i) => (
          <div key={i.big}>
            <p className="text-[22px] md:text-[26px] font-bold tracking-display leading-tight">{i.big}</p>
            <p className="mt-2 text-[12px] text-muted-foreground leading-relaxed">{i.small}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductCard({
  surface,
  eyebrow,
  title,
  children,
  className = "",
}: {
  surface: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={"gloss-card hover-glow " + surface + " " + className + " p-7 md:p-8 flex flex-col min-h-[340px] text-white"}>
      <h3 className="text-[20px] md:text-[22px] font-bold tracking-display leading-snug max-w-[18ch]">
        {title}
      </h3>
      <div className="flex-1 flex items-center py-6">{children}</div>
      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/85">{eyebrow}</span>
        <span aria-hidden className="text-white/70">→</span>
      </div>
    </div>
  );
}

function Products() {
  return (
    <section className="py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-4">Products</p>
        <h2 className="text-[34px] md:text-[48px] tracking-display font-bold leading-tight max-w-3xl">
          Financial clarity, out of the box.
        </h2>
        <p className="mt-5 text-[15px] md:text-[16px] text-muted-foreground max-w-2xl leading-relaxed">
          Not another budgeting app. Maal reads your statements, accounts and transactions — then turns
          them into education you can act on.
        </p>

        <div className="mt-12 grid md:grid-cols-2 gap-5">
          <ProductCard surface="surface-forest" eyebrow="Scores" title="Your money in one number.">
            <div className="inner-pill rounded-[14px] px-5 py-4 flex items-center gap-4 w-full max-w-[300px] mx-auto">
              <div className="relative size-[68px] rounded-full grid place-items-center"
                style={{ background: "conic-gradient(#2DD4C4 0 72%, rgba(255,255,255,0.12) 0)" }}>
                <div className="size-[54px] rounded-full bg-black/40 grid place-items-center text-white text-[18px] font-bold tabular-nums tracking-display">
                  72
                </div>
              </div>
              <div>
                <p className="text-[13px] font-semibold">Maal Score</p>
                <p className="text-[11px] text-white/70 mt-0.5">Strong · tracked daily</p>
              </div>
            </div>
          </ProductCard>

          <ProductCard surface="surface-taupe" eyebrow="Ask Maal" title={"Ask anything, grounded in your data."}>
            <div className="w-full space-y-3">
              <div className="inner-pill rounded-full px-4 py-2 text-[12px] inline-block">
                Is my super on track for 60?
              </div>
              <div className="inner-pill rounded-[14px] px-4 py-3 text-[12.5px] leading-relaxed max-w-[320px]">
                On your trajectory you’re tracking ~$46k ahead of the ASFA comfortable benchmark.
              </div>
            </div>
          </ProductCard>

          <ProductCard surface="surface-olive" eyebrow="Radar" title="Catch what’s changing.">
            <div className="w-full space-y-2.5">
              <div className="inner-pill rounded-[12px] px-4 py-2.5 text-[12.5px] flex items-center gap-2">
                <span>📈</span> NVDA moved +11% today
              </div>
              <div className="inner-pill rounded-[12px] px-4 py-2.5 text-[12.5px]">
                We flagged it — here’s what drove it.
              </div>
            </div>
          </ProductCard>

          <ProductCard surface="surface-amber" eyebrow="Portfolio" title="See your wealth move over time.">
            <div className="inner-pill rounded-[14px] p-5 w-full">
              <div className="flex items-baseline justify-between">
                <span className="text-[24px] font-bold tracking-display tabular-nums">$39,550</span>
                <span className="text-[11px] font-semibold inner-pill rounded-full px-2 py-1">▲ +7.5% · 1M</span>
              </div>
              <svg viewBox="0 0 200 60" className="mt-3 w-full h-[60px]">
                <defs>
                  <linearGradient id="sp" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.5)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                  </linearGradient>
                </defs>
                <path d="M0,50 C30,45 60,40 90,35 C120,30 150,25 200,12" fill="none" stroke="white" strokeWidth="1.5" />
                <path d="M0,50 C30,45 60,40 90,35 C120,30 150,25 200,12 L200,60 L0,60 Z" fill="url(#sp)" opacity="0.4" />
              </svg>
            </div>
          </ProductCard>

          <ProductCard surface="surface-cocoa" eyebrow="Accounts" title="Every account, one clear picture." className="md:col-span-2">
            <div className="w-full grid md:grid-cols-2 gap-3 max-w-[640px]">
              {[
                { name: "CommBank · transactions" },
                { name: "AustralianSuper · super" },
              ].map((a) => (
                <div key={a.name} className="inner-pill rounded-[12px] px-4 py-3 flex items-center justify-between text-[12.5px]">
                  <span>{a.name}</span>
                  <span className="size-1.5 rounded-full bg-[var(--mint)]" />
                </div>
              ))}
              <div className="md:col-span-2 inner-pill rounded-[12px] px-4 py-3 text-[12px] text-white/80">
                Read-only via Basiq · revoke anytime
              </div>
            </div>
          </ProductCard>
        </div>
      </div>
    </section>
  );
}

function WhyMaal() {
  const points = [
    { t: "Clarity by design", d: "Net worth, debt, super, spending and investments in one place — explained in plain language so you always know where you stand." },
    { t: "Australian to the core", d: "Superannuation, HECS-HELP, franking credits, EOFY, the ATO — Maal speaks Australian finance natively, not as a US import." },
    { t: "Secure and read-only", d: "Bank connections via Basiq under the Consumer Data Right. Maal can never move money. Credentials are never stored. Your data is never sold." },
    { t: "Education, not instructions", d: "Maal explains what’s happening in your finances and why it matters. The decisions stay yours." },
  ];
  return (
    <section className="py-20 md:py-24 border-t border-border">
      <div className="max-w-5xl mx-auto px-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-4">Why Maal</p>
        <h2 className="text-[28px] md:text-[36px] tracking-display font-bold leading-tight max-w-3xl">
          Most platforms tell you what your money is doing. Almost none help you{" "}
          <span className="text-[var(--mint)]">understand it</span>. Maal is built for everyday
          Australians who want to grow wealth <span className="text-[var(--mint)]">and</span> plan
          with confidence — the all-in-one for your money.
        </h2>
        <div className="mt-12 divide-y divide-border border-y border-border">
          {points.map((p) => (
            <div key={p.t} className="grid md:grid-cols-[200px_1fr] gap-3 md:gap-8 py-6">
              <div className="flex items-center gap-3">
                <span className="size-2 rounded-full bg-[var(--mint)]" />
                <p className="text-[15px] font-bold">{p.t}</p>
              </div>
              <p className="text-[14px] text-muted-foreground leading-relaxed">{p.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", title: "Tell Maal what you have", body: "Add your income, super balance, HECS, mortgage, savings, and any investments. Takes a few minutes — no bank login needed to start." },
    { n: "02", title: "Get your Maal Score", body: "A weighted 0–100 read of your financial health across five pillars: net worth, debt, super, diversification, and emergency buffer." },
    { n: "03", title: "Follow your action plan", body: "A prioritised list of moves to lift your score, ranked by impact — pay down debt, top up super, build your buffer. The plan adapts as your situation changes." },
  ];
  return (
    <section className="py-24 border-t border-border bg-[var(--secondary)]/30">
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-14">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">How it works</p>
          <h2 className="text-[32px] md:text-[40px] tracking-display font-bold leading-tight max-w-2xl">
            Three steps from spreadsheets to a single, honest number.
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-px bg-border border border-border rounded-[14px] overflow-hidden">
          {steps.map((s) => (
            <div key={s.n} className="bg-[var(--surface)] p-8">
              <div className="text-[11px] font-bold text-[var(--mint)] tracking-[0.18em] mb-6">{s.n}</div>
              <h3 className="text-[18px] font-bold tracking-display mb-3">{s.title}</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingStrip() {
  const tiers = [
    { name: "Free", price: "$0", per: "forever", desc: "Maal Score, basic dashboard, manual entry.", cta: "Start free", to: "/auth", featured: false },
    { name: "Pro", price: "$20", per: "AUD / month", desc: "Open banking sync, retirement projections, tax & super tools, Ask Maal.", cta: "Get Pro", to: "/pricing", featured: true },
    { name: "Max", price: "$200", per: "AUD / month", desc: "Multi-entity, Radar alerts, Vault PDF extraction, priority advisor.", cta: "Talk to us", to: "/pricing", featured: false },
  ];
  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-12">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">Pricing</p>
          <h2 className="text-[32px] md:text-[40px] tracking-display font-bold leading-tight">
            One product. Three honest tiers.
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {tiers.map((t) => (
            <div key={t.name} className={"p-8 rounded-[14px] border bg-[var(--surface)] flex flex-col " + (t.featured ? "border-foreground" : "border-border")}>
              {t.featured && (
                <span className="self-start text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--mint)] mb-3">Most popular</span>
              )}
              <h3 className="text-[14px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{t.name}</h3>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-[40px] font-bold tracking-display">{t.price}</span>
                <span className="text-[12px] text-muted-foreground">{t.per}</span>
              </div>
              <p className="text-[13px] text-muted-foreground mt-3 leading-relaxed min-h-[44px]">{t.desc}</p>
              <Link to={t.to} className={"mt-7 inline-flex items-center justify-center px-4 py-2.5 rounded-[8px] text-[13px] font-semibold transition-all " + (t.featured ? "bg-foreground text-background hover:bg-foreground/90" : "border border-border hover:bg-[var(--secondary)]")}>
                {t.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="py-20 border-t border-border">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-[32px] md:text-[40px] tracking-display font-bold leading-tight">
          Stop guessing. Start scoring.
        </h2>
        <p className="mt-5 text-[15px] text-muted-foreground max-w-xl mx-auto">
          Two minutes to your first Maal Score. No bank login. No credit card.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/score" className="bg-foreground text-background px-5 py-3 rounded-[8px] text-[14px] font-semibold hover:bg-foreground/90">
            Calculate your score
          </Link>
          <Link to="/waitlist" className="px-5 py-3 rounded-[8px] text-[14px] font-semibold border border-border hover:bg-[var(--secondary)]">
            Join the waitlist
          </Link>
        </div>
      </div>
    </section>
  );
}