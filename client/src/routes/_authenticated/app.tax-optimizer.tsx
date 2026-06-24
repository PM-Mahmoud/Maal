import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Reveal } from "@/components/maal/Reveal";
import { Disclaimer } from "@/components/maal/Disclaimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { RotateCcw } from "lucide-react";
import { formatAUD } from "@/lib/score";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/tax-optimizer")({
  component: TaxOptimizer,
});

/** Precise AUD formatter for tax figures where exact dollars matter. */
const fmtExact = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface TaxInputs {
  grossIncome: number;
  workExpenses: number;
  selfEdExpenses: number;
  donations: number;
  superConcessional: number;
  hecsBalance: number;
  hasPrivateCover: "yes" | "no";
}

interface TaxBreakdown {
  taxableIncome: number;
  incomeTax: number;
  medicareLevy: number;
  mls: number;
  hecsRepayment: number;
  lito: number;
  totalTax: number;
  marginalRate: number;
  effectiveRate: number;
  taxSaved: number;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "maal:tax";

/** FY 2025-26 concessional super cap. */
const SUPER_CAP_FY25 = 30_000;

const DEFAULTS: TaxInputs = {
  grossIncome: 180_000,
  workExpenses: 5_000,
  selfEdExpenses: 2_000,
  donations: 500,
  superConcessional: 15_000,
  hecsBalance: 20_000,
  hasPrivateCover: "no",
};

/**
 * ATO FY2025-26 resident tax brackets (stage-3).
 * `threshold` is the income level above which `rate` applies.
 *   - $0–$18,200:        0%
 *   - $18,201–$45,000:   16%
 *   - $45,001–$135,000:  30%
 *   - $135,001–$190,000: 37%
 *   - $190,001+:         45%
 */
const TAX_BRACKETS: ReadonlyArray<{ threshold: number; rate: number }> = [
  { threshold: 0, rate: 0 },
  { threshold: 18_200, rate: 0.16 },
  { threshold: 45_000, rate: 0.3 },
  { threshold: 135_000, rate: 0.37 },
  { threshold: 190_000, rate: 0.45 },
];

/**
 * HECS/HELP compulsory repayment rates (simplified table).
 * `lower` is the income at and above which `rate` applies.
 */
const HECS_THRESHOLDS: ReadonlyArray<{ lower: number; rate: number }> = [
  { lower: 0, rate: 0 },
  { lower: 51_550, rate: 0.01 },
  { lower: 59_520, rate: 0.02 },
  { lower: 63_090, rate: 0.025 },
  { lower: 66_880, rate: 0.03 },
  { lower: 70_900, rate: 0.035 },
  { lower: 75_250, rate: 0.04 },
  { lower: 79_900, rate: 0.045 },
  { lower: 84_860, rate: 0.05 },
  { lower: 90_200, rate: 0.055 },
  { lower: 95_900, rate: 0.06 },
  { lower: 102_000, rate: 0.065 },
  { lower: 108_200, rate: 0.07 },
  { lower: 114_800, rate: 0.075 },
  { lower: 121_700, rate: 0.08 },
  { lower: 128_900, rate: 0.085 },
  { lower: 136_400, rate: 0.09 },
  { lower: 144_100, rate: 0.095 },
  { lower: 152_100, rate: 0.1 },
];

const CHART_SLICES = [
  { key: "incomeTax", label: "Income tax", color: "var(--foreground)" },
  { key: "medicare", label: "Medicare Levy", color: "var(--mint)" },
  { key: "mls", label: "MLS", color: "var(--gold)" },
  { key: "hecs", label: "HECS repayment", color: "var(--muted-foreground)" },
] as const;

/* -------------------------------------------------------------------------- */
/*  Tax Engine (deterministic, no LLM)                                        */
/* -------------------------------------------------------------------------- */

function computeIncomeTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  for (let i = 0; i < TAX_BRACKETS.length; i++) {
    const cur = TAX_BRACKETS[i];
    const next = TAX_BRACKETS[i + 1];
    const upper = next ? next.threshold : Infinity;
    if (taxableIncome > cur.threshold) {
      const slice = Math.min(taxableIncome, upper) - cur.threshold;
      tax += slice * cur.rate;
    } else {
      break;
    }
  }
  return tax;
}

function marginalRateFor(taxableIncome: number): number {
  let rate = 0;
  for (const b of TAX_BRACKETS) {
    if (taxableIncome > b.threshold) {
      rate = b.rate;
    } else {
      break;
    }
  }
  return rate;
}

/** Medicare Levy — simplified: 2% above $26,000, 0 below. */
function computeMedicareLevy(taxableIncome: number): number {
  if (taxableIncome <= 26_000) return 0;
  return taxableIncome * 0.02;
}

/** Medicare Levy Surcharge — simplified: 1% if no private cover AND income > $93,000. */
function computeMLS(taxableIncome: number, hasPrivateCover: boolean): number {
  if (hasPrivateCover) return 0;
  if (taxableIncome <= 93_000) return 0;
  return taxableIncome * 0.01;
}

/** Low Income Tax Offset — max $700, reducing by 5c per $1 over $37,500, min $0. */
function computeLITO(taxableIncome: number): number {
  if (taxableIncome <= 37_500) return 700;
  const reduction = (taxableIncome - 37_500) * 0.05;
  return Math.max(0, 700 - reduction);
}

/** HECS/HELP compulsory repayment (simplified). */
function computeHecsRepayment(taxableIncome: number, hecsBalance: number): number {
  if (hecsBalance <= 0) return 0;
  let rate = 0;
  for (const t of HECS_THRESHOLDS) {
    if (taxableIncome >= t.lower) {
      rate = t.rate;
    } else {
      break;
    }
  }
  return taxableIncome * rate;
}

function computeTax(input: TaxInputs): TaxBreakdown {
  const hasPrivateCover = input.hasPrivateCover === "yes";
  const superDeduction = Math.min(input.superConcessional, SUPER_CAP_FY25);

  const taxableIncome = Math.max(
    0,
    input.grossIncome -
      input.workExpenses -
      input.selfEdExpenses -
      input.donations -
      superDeduction,
  );

  const incomeTax = computeIncomeTax(taxableIncome);
  const medicareLevy = computeMedicareLevy(taxableIncome);
  const mls = computeMLS(taxableIncome, hasPrivateCover);
  const hecsRepayment = computeHecsRepayment(taxableIncome, input.hecsBalance);
  const lito = computeLITO(taxableIncome);

  const totalTax = Math.max(0, incomeTax + medicareLevy + mls + hecsRepayment - lito);

  // Compare against a no-deductions scenario to estimate tax saved
  const gross = Math.max(0, input.grossIncome);
  const noDedIncomeTax = computeIncomeTax(gross);
  const noDedMedicare = computeMedicareLevy(gross);
  const noDedMls = computeMLS(gross, hasPrivateCover);
  const noDedHecs = computeHecsRepayment(gross, input.hecsBalance);
  const noDedLito = computeLITO(gross);
  const totalTaxNoDed = Math.max(
    0,
    noDedIncomeTax + noDedMedicare + noDedMls + noDedHecs - noDedLito,
  );

  const taxSaved = Math.max(0, totalTaxNoDed - totalTax);

  return {
    taxableIncome,
    incomeTax,
    medicareLevy,
    mls,
    hecsRepayment,
    lito,
    totalTax,
    marginalRate: marginalRateFor(taxableIncome),
    effectiveRate: input.grossIncome > 0 ? totalTax / input.grossIncome : 0,
    taxSaved,
  };
}

/* -------------------------------------------------------------------------- */
/*  Persistence helpers                                                       */
/* -------------------------------------------------------------------------- */

function loadInputs(): Partial<TaxInputs> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<TaxInputs>) : null;
  } catch {
    return null;
  }
}

function saveInputs(input: TaxInputs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

function fmtPct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

/* -------------------------------------------------------------------------- */
/*  UI Sub-components                                                          */
/* -------------------------------------------------------------------------- */

function NumberField({
  label,
  value,
  onChange,
  hint,
  min = 0,
  step = 1000,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  min?: number;
  step?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          $
        </span>
        <Input
          type="number"
          inputMode="numeric"
          min={min}
          step={step}
          value={value === 0 ? "" : value}
          placeholder="0"
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) && n >= 0 ? n : 0);
          }}
          className="rounded-md pl-7 tabular-nums"
        />
      </div>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SliderRow({
  label,
  value,
  onChange,
  min,
  max,
  step,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="text-xs tabular-nums text-foreground">
          {formatAUD(value)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
      />
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-2/40 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${accent ? "text-mint" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-hairline bg-background px-3 py-2 shadow-lg">
      {label ? (
        <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      ) : null}
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-xs">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium tabular-nums">{fmtExact(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

function TaxOptimizer() {
  const [input, setInput] = useState<TaxInputs>(DEFAULTS);
  const mountedRef = useRef(false);

  useEffect(() => {
    const saved = loadInputs();
    requestAnimationFrame(() => {
      if (saved) {
        setInput((prev) => ({ ...prev, ...saved }));
      }
      mountedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!mountedRef.current) return;
    const timer = setTimeout(() => {
      saveInputs(input);
    }, 400);
    return () => clearTimeout(timer);
  }, [input]);

  const result = useMemo(() => computeTax(input), [input]);

  const chartData = useMemo(
    () => [
      {
        name: "Tax breakdown",
        incomeTax: Math.round(result.incomeTax),
        medicare: Math.round(result.medicareLevy),
        mls: Math.round(result.mls),
        hecs: Math.round(result.hecsRepayment),
      },
    ],
    [result],
  );

  const update = <K extends keyof TaxInputs>(key: K, val: TaxInputs[K]) =>
    setInput((prev) => ({ ...prev, [key]: val }));

  const reset = () => {
    setInput(DEFAULTS);
    toast.success("Reset to sample inputs");
  };

  const superCapUsed = Math.min(input.superConcessional, SUPER_CAP_FY25);
  const superCapRemaining = Math.max(0, SUPER_CAP_FY25 - superCapUsed);
  const superPct = Math.round((superCapUsed / SUPER_CAP_FY25) * 100);

  return (
    <section id="tax" className="scroll-mt-20 border-t border-hairline bg-surface-2/40">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal className="max-w-2xl">
          <span className="text-xs font-medium uppercase tracking-widest text-mint">
            Tax Optimizer
          </span>
          <h2 className="mt-3 tracking-display text-3xl sm:text-4xl">
            Find dollars hiding in your tax return.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Built for Australian doctors. Estimate your FY 2025-26 income tax,
            Medicare Levy, surcharge and HECS repayment — then see how deductions
            and super contributions change the picture.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_minmax(360px,420px)]">
          {/* ---- Inputs ---- */}
          <Reveal className="rounded-2xl border border-hairline bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="tracking-display text-lg">Your tax picture</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                className="text-muted-foreground"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
              </Button>
            </div>

            <div className="mt-5 space-y-5">
              <NumberField
                label="Gross annual income"
                value={input.grossIncome}
                onChange={(n) => update("grossIncome", n)}
                hint="Total salary, wages, and other taxable income before tax"
              />

              <SliderRow
                label="Work-related expenses"
                value={input.workExpenses}
                onChange={(n) => update("workExpenses", n)}
                min={0}
                max={30_000}
                step={500}
                hint="CPD, equipment, indemnity insurance, union fees"
              />

              <SliderRow
                label="Self-education expenses"
                value={input.selfEdExpenses}
                onChange={(n) => update("selfEdExpenses", n)}
                min={0}
                max={10_000}
                step={250}
                hint="Courses, conferences, textbooks tied to current role"
              />

              <SliderRow
                label="Charitable donations"
                value={input.donations}
                onChange={(n) => update("donations", n)}
                min={0}
                max={5_000}
                step={100}
                hint="Deductible gift-recipient donations"
              />

              <SliderRow
                label="Superannuation concessional contributions"
                value={input.superConcessional}
                onChange={(n) => update("superConcessional", n)}
                min={0}
                max={30_000}
                step={500}
                hint={`FY25-26 cap is ${formatAUD(SUPER_CAP_FY25)} (salary sacrifice + personal)`}
              />

              <NumberField
                label="HECS/HELP debt balance"
                value={input.hecsBalance}
                onChange={(n) => update("hecsBalance", n)}
                step={500}
                hint="Outstanding balance — drives compulsory repayment"
              />

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Private hospital cover
                </Label>
                <Select
                  value={input.hasPrivateCover}
                  onValueChange={(v) => update("hasPrivateCover", v as "yes" | "no")}
                >
                  <SelectTrigger className="rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Affects Medicare Levy Surcharge (MLS) above $93,000 income
                </p>
              </div>
            </div>
          </Reveal>

          {/* ---- Results ---- */}
          <Reveal delay={100} className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-hairline bg-card p-6 shadow-[0_30px_60px_-30px_oklch(0.16_0_0/0.3)]">
              <p className="text-xs text-muted-foreground">
                Estimated total tax (FY 2025-26)
              </p>
              <p className="mt-1 tracking-display text-4xl tabular-nums sm:text-5xl">
                {fmtExact(result.totalTax)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                On taxable income of{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {fmtExact(result.taxableIncome)}
                </span>
              </p>

              {/* 2x2 mini stats */}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <Stat label="Marginal rate" value={fmtPct(result.marginalRate)} />
                <Stat label="Effective rate" value={fmtPct(result.effectiveRate)} />
                <Stat label="HECS repayment" value={fmtExact(result.hecsRepayment)} />
                <Stat
                  label="Tax saved by deductions"
                  value={fmtExact(result.taxSaved)}
                  accent
                />
              </div>

              {/* Tax breakdown bar chart */}
              <div className="mt-6">
                <p className="text-xs font-medium text-muted-foreground">Tax breakdown</p>
                <div className="mt-2 h-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={chartData}
                      margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" hide />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "transparent" }} />
                      {CHART_SLICES.map((slice, i) => (
                        <Bar
                          key={slice.key}
                          dataKey={slice.key}
                          stackId="a"
                          fill={slice.color}
                          radius={i === CHART_SLICES.length - 1 ? [0, 4, 4, 0] : undefined}
                        >
                          {chartData.map((_, cellIdx) => (
                            <Cell key={`cell-${slice.key}-${cellIdx}`} fill={slice.color} />
                          ))}
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {CHART_SLICES.map((slice) => (
                    <div
                      key={slice.key}
                      className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                    >
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-sm"
                        style={{ backgroundColor: slice.color }}
                      />
                      <span>{slice.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Super strategy callout */}
              <div className="mt-6 rounded-xl border border-hairline bg-surface-2/40 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Super strategy</p>
                  <span className="text-xs tabular-nums text-mint">
                    {formatAUD(superCapRemaining)} cap room left
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-mint transition-all duration-500"
                    style={{ width: `${superPct}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                  Contributing up to your cap reduces taxable income at your
                  marginal rate. Caps carry forward if your balance is under
                  $500k (rules apply).
                </p>
              </div>

              {/* Disclaimer */}
              <div className="mt-4">
                <Disclaimer variant="inline" />
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
