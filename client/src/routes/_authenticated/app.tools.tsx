import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/tools")({ component: ToolsPage });

const TOOLS = [
  { name: "ATO myTax", cat: "Tax", url: "https://my.gov.au", desc: "Lodge your Australian tax return directly with the ATO." },
  { name: "ASIC MoneySmart Calculators", cat: "Planning", url: "https://moneysmart.gov.au", desc: "Free calculators for super, mortgage, retirement and budgeting." },
  { name: "ASFA Retirement Standard", cat: "Retirement", url: "https://www.superannuation.asn.au/resources/retirement-standard", desc: "Benchmark Comfortable and Modest retirement budgets, updated quarterly." },
  { name: "APRA Super Fund Heatmap", cat: "Super", url: "https://www.apra.gov.au/heatmap", desc: "Compare super fund performance and fees." },
  { name: "ASX ETF Screener", cat: "Investing", url: "https://www.asx.com.au/products/etf.htm", desc: "Browse Australian-listed ETFs with fees and holdings." },
  { name: "Vanguard Australia", cat: "Investing", url: "https://www.vanguard.com.au", desc: "Low-cost index funds and ETFs." },
  { name: "Hejaz Financial Services", cat: "Ethical (Islamic)", url: "https://www.hejazfs.com.au", desc: "Shariah-compliant super and investments." },
  { name: "Australian Ethical Super", cat: "Ethical (ESG)", url: "https://www.australianethical.com.au", desc: "Ethically screened super and investments." },
  { name: "Pearler", cat: "Brokerage", url: "https://pearler.com", desc: "Low-cost Australian brokerage for long-term ETF investors." },
  { name: "Sharesight", cat: "Tracking", url: "https://www.sharesight.com", desc: "Portfolio tracking and tax reporting." },
];

function ToolsPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">Tools</p>
      <h1 className="text-[32px] tracking-display font-bold mb-8">Curated for Australians.</h1>
      <div className="grid md:grid-cols-2 gap-3">
        {TOOLS.map((t) => (
          <a key={t.name} href={t.url} target="_blank" rel="noreferrer noopener"
            className="block p-5 border border-border rounded-[12px] bg-[var(--surface)] hover:border-foreground transition-colors">
            <div className="flex items-baseline justify-between mb-1">
              <p className="text-[14px] font-semibold">{t.name}</p>
              <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--mint)]">{t.cat}</span>
            </div>
            <p className="text-[13px] text-muted-foreground">{t.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}