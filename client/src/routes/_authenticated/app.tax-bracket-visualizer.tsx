import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Reveal } from "@/components/maal/Reveal";
import { Disclaimer } from "@/components/maal/Disclaimer";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calculator, TrendingDown, Percent, Wallet, Receipt, ArrowDownRight } from "lucide-react";
import { formatAUD } from "@/lib/score";

export const Route = createFileRoute("/_authenticated/app/tax-bracket-visualizer")({
  component: TaxBracketVisualizer,
});

/** Precise AUD formatter for tax figures where exact dollars matter. */
const fmtExact = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");

/* -------------------------------------------------------------------------- */
/*  AU 2025-26 tax brackets (excl. Medicare levy — shown separately)           */
/* -------------------------------------------------------------------------- */

interface Bracket {
  min: number;
  max: number | null;
  rate: number;
  label: string;
}

const BRACKETS: Bracket[] = [
  { min: 0, max: 18_200, rate: 0, label: "Tax-free" },
  { min: 18_201, max: 45_000, rate: 0.16, label: "16c" },
  { min: 45_001, max: 135_000, rate: 0.3, label: "30c" },
  { min: 135_001, max: 190_000, rate: 0.37, label: "37c" },
  { min: 190_001, max: null, rate: 0.45, label: "45c" },
];

const MEDICARE_LEVY_RATE = 0.02;
const MEDICARE_LEVY_THRESHOLD = 24_276; // single
const MEDICARE_LEVY_PHASE_IN_LIMIT = MEDICARE_LEVY_THRESHOLD * 1.1;

interface BracketResult extends Bracket {
  taxableInThisBracket: number;
  taxInThisBracket: number;
}

function calculateTax(
  income: number,
  deductions: number,
): {
  taxable: number;
  brackets: BracketResult[];
  totalTax: number;
  medicare: number;
  net: number;
  effectiveRate: number;
  marginalRate: number;
} {
  const taxable = Math.max(0, income - deductions);
  const brackets: BracketResult[] = [];
  let totalTax = 0;

  for (const b of BRACKETS) {
    const upper = b.max ?? Number.MAX_SAFE_INTEGER;
    if (taxable > b.min) {
      const inBracket = Math.min(taxable, upper) - b.min;
      const tax = inBracket * b.rate;
      brackets.push({ ...b, taxableInThisBracket: inBracket, taxInThisBracket: tax });
      totalTax += tax;
    } else {
      brackets.push({ ...b, taxableInThisBracket: 0, taxInThisBracket: 0 });
    }
  }

  // Medicare levy — phased in above threshold
  let medicare = 0;
  if (taxable > MEDICARE_LEVY_THRESHOLD) {
    const fullLevy = taxable * MEDICARE_LEVY_RATE;
    if (taxable < MEDICARE_LEVY_PHASE_IN_LIMIT) {
      // phase in: 10c per dollar above threshold
      medicare = Math.min(fullLevy, (taxable - MEDICARE_LEVY_THRESHOLD) * 0.1);
    } else {
      medicare = fullLevy;
    }
  }

  const totalWithMedicare = totalTax + medicare;
  const net = income - totalWithMedicare;
  const effectiveRate = income > 0 ? (totalWithMedicare / income) * 100 : 0;

  // marginal rate (top bracket with taxable > 0)
  const topBracket = [...brackets].reverse().find((b) => b.taxableInThisBracket > 0);
  const marginalRate = topBracket ? topBracket.rate * 100 : 0;

  return {
    taxable,
    brackets,
    totalTax,
    medicare,
    net,
    effectiveRate,
    marginalRate,
  };
}

const DEDUCTION_PRESETS = [
  { label: "None", value: 0 },
  { label: "Standard ($300)", value: 300 },
  { label: "Pro ($3k)", value: 3000 },
  { label: "Heavy ($8k)", value: 8000 },
  { label: "Max ($15k)", value: 15_000 },
];

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

function TaxBracketVisualizer() {
  const [income, setIncome] = useState(180_000);
  const [deductions, setDeductions] = useState(3_000);

  const result = useMemo(() => calculateTax(income, deductions), [income, deductions]);

  const taxSavings = useMemo(() => {
    const withoutDed = calculateTax(income, 0);
    return withoutDed.totalTax + withoutDed.medicare - result.totalTax - result.medicare;
  }, [income, result]);

  // Chart data — cumulative tax per bracket
  const chartMax = Math.max(income, 200_000);

  return (
    <section id="tax-bracket" className="scroll-mt-20 border-t border-hairline">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal className="max-w-2xl">
          <div className="flex items-center gap-3">
            <span className="section-number">🧾</span>
            <span className="eyebrow-bullet">Tax Bracket Visualizer</span>
          </div>
          <h2 className="mt-3 tracking-display text-3xl sm:text-4xl">
            See exactly where your <span className="text-gradient-mint">tax dollars go.</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            AU FY 2025-26 financial year brackets. Drag the sliders to see how
            deductions shift you between brackets — and what the ATO actually keeps.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-8 lg:grid-cols-[340px_1fr]">
          {/* Controls */}
          <Reveal delay={50}>
            <Card className="border-hairline p-5 space-y-5">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Gross income — <span className="text-foreground font-medium">{formatAUD(income)}</span>
                </Label>
                <Slider
                  value={[income]}
                  onValueChange={([v]) => setIncome(v)}
                  min={0}
                  max={400_000}
                  step={5_000}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>$0</span>
                  <span>$400k</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Deductions — <span className="text-foreground font-medium">{formatAUD(deductions)}</span>
                </Label>
                <Slider
                  value={[deductions]}
                  onValueChange={([v]) => setDeductions(v)}
                  min={0}
                  max={30_000}
                  step={500}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {DEDUCTION_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setDeductions(p.value)}
                      className={`pill-group-item text-[10px] ${
                        deductions === p.value ? "pill-group-item-active" : "border border-hairline"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-mint/30 bg-mint-soft/50 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ArrowDownRight className="h-3.5 w-3.5 text-mint" />
                  Tax saved by deductions
                </div>
                <p className="mt-1 tracking-display text-2xl tabular-nums text-mint">
                  {fmtExact(taxSavings)}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  At your marginal rate of {result.marginalRate.toFixed(0)}%
                </p>
              </div>

              <Disclaimer variant="inline" />
            </Card>
          </Reveal>

          {/* Visualization */}
          <Reveal delay={100}>
            <div className="space-y-4">
              {/* Key stats */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="kpi-tile rounded-xl border border-hairline bg-card p-3">
                  <div className="flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5 text-mint" />
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Taxable</p>
                  </div>
                  <p className="mt-1 tracking-display text-lg tabular-nums">{fmtExact(result.taxable)}</p>
                </div>
                <div className="kpi-tile rounded-xl border border-hairline bg-card p-3">
                  <div className="flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5 text-rose-500" />
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Income tax</p>
                  </div>
                  <p className="mt-1 tracking-display text-lg tabular-nums text-rose-500">{fmtExact(result.totalTax)}</p>
                </div>
                <div className="kpi-tile rounded-xl border border-hairline bg-card p-3">
                  <div className="flex items-center gap-1.5">
                    <Percent className="h-3.5 w-3.5 text-amber-500" />
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Medicare</p>
                  </div>
                  <p className="mt-1 tracking-display text-lg tabular-nums text-amber-500">{fmtExact(result.medicare)}</p>
                </div>
                <div className="kpi-tile rounded-xl border border-mint/30 bg-mint-soft/30 p-3">
                  <div className="flex items-center gap-1.5">
                    <TrendingDown className="h-3.5 w-3.5 text-mint" />
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Take-home</p>
                  </div>
                  <p className="mt-1 tracking-display text-lg tabular-nums text-mint">{fmtExact(result.net)}</p>
                </div>
              </div>

              {/* Bracket breakdown visualization */}
              <Card className="border-hairline p-5">
                <div className="flex items-center justify-between">
                  <h3 className="tracking-display text-base">Bracket breakdown</h3>
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Calculator className="h-3 w-3" />
                    FY 2025-26
                  </Badge>
                </div>

                {/* Stacked bar */}
                <div className="mt-4">
                  <div
                    className="flex h-8 overflow-hidden rounded-md border border-hairline"
                    role="img"
                    aria-label="Tax bracket breakdown bar"
                  >
                    {result.brackets.map((b, i) => {
                      const widthPct = (b.taxableInThisBracket / chartMax) * 100;
                      if (widthPct === 0) return null;
                      const colors = [
                        "bg-emerald-400",
                        "bg-mint",
                        "bg-amber-400",
                        "bg-orange-400",
                        "bg-rose-500",
                      ];
                      return (
                        <div
                          key={i}
                          className={`${colors[i]} flex items-center justify-center text-[9px] font-medium text-background transition-all duration-500`}
                          style={{ width: `${widthPct}%` }}
                          title={`${b.label}: ${fmtExact(b.taxableInThisBracket)} @ ${(b.rate * 100).toFixed(0)}% = ${fmtExact(b.taxInThisBracket)}`}
                        >
                          {widthPct > 8 ? `${(b.rate * 100).toFixed(0)}%` : ""}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>$0</span>
                    <span>{formatAUD(chartMax)}</span>
                  </div>
                </div>

                {/* Bracket rows */}
                <div className="mt-5 space-y-1.5">
                  {result.brackets.map((b, i) => {
                    const colors = ["bg-emerald-400", "bg-mint", "bg-amber-400", "bg-orange-400", "bg-rose-500"];
                    const isActive = b.taxableInThisBracket > 0;
                    return (
                      <div
                        key={i}
                        className={`flex items-center justify-between rounded-md px-3 py-2 transition-colors ${
                          isActive ? "bg-surface-2/60" : "opacity-50"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`h-2.5 w-2.5 rounded-full ${colors[i]}`} />
                          <span className="text-xs text-muted-foreground">
                            {b.max
                              ? `$${(b.min / 1000).toFixed(0)}k–$${(b.max / 1000).toFixed(0)}k`
                              : `$${(b.min / 1000).toFixed(0)}k+`}
                          </span>
                          <span className="text-[10px] text-muted-foreground">({b.label})</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {fmtExact(b.taxableInThisBracket)}
                          </span>
                          <span className="text-xs font-medium tabular-nums w-20 text-right">
                            {fmtExact(b.taxInThisBracket)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Totals */}
                <div className="mt-4 space-y-1.5 border-t border-hairline pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Income tax + Medicare levy</span>
                    <span className="tracking-display tabular-nums">
                      {fmtExact(result.totalTax + result.medicare)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Effective tax rate</span>
                    <span className="tracking-display tabular-nums text-amber-500">
                      {result.effectiveRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Marginal rate</span>
                    <span className="tracking-display tabular-nums text-rose-500">
                      {result.marginalRate.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </Card>

              {/* Marginal vs effective explainer */}
              <Card className="border-hairline p-4">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-mint-soft shrink-0">
                    <Calculator className="h-4 w-4 text-mint" />
                  </span>
                  <div className="text-xs text-muted-foreground">
                    <p>
                      <strong className="text-foreground">Marginal rate</strong> is the rate on your next dollar earned.
                      <strong className="text-foreground"> Effective rate</strong> is your average rate across all brackets.
                    </p>
                    <p className="mt-1.5">
                      At <strong className="text-foreground">{formatAUD(income)}</strong>, every extra dollar earns you{" "}
                      <strong className="text-emerald-500">{((100 - result.marginalRate) / 100).toFixed(2)}</strong> after tax.
                      Salary sacrificing saves at the marginal rate.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
