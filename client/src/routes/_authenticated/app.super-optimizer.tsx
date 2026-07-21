import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Reveal } from "@/components/maal/Reveal";
import { Disclaimer } from "@/components/maal/Disclaimer";
import { SliderWithInput } from "@/components/maal/SliderWithInput";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { PiggyBank, TrendingUp, Zap, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatAUD } from "@/lib/score";
import { getConstants, combinedMarginalRate } from "@/lib/au-constants";
import { cappedTotalContribution, remainingConcessionalCap } from "../../../../shared/super-contrib.mjs";

export const Route = createFileRoute("/_authenticated/app/super-optimizer")({
  component: SuperOptimiser,
});

/* -------------------------------------------------------------------------- */
/*  Constants — all FY-keyed rates/thresholds come from the shared AU          */
/*  constants (shared/au-constants.json via @/lib/au-constants), the same      */
/*  AUTHORITATIVE source the server uses. Nothing tax-related is hardcoded.    */
/* -------------------------------------------------------------------------- */

const AU = getConstants();
const SG_RATE = AU.super.sgRate;
const CONCESSIONAL_CAP = AU.super.concessionalCap;
const DIV293_THRESHOLD = AU.super.division293Threshold;
/** Tax on fund earnings in accumulation (Division 293 does NOT touch this). */
const EARNINGS_TAX = AU.super.earningsRateInAccumulation;
/** Extra contributions tax when Division 293 applies. */
const DIV293_EXTRA = AU.super.division293ExtraRate;

const AGE_OPTIONS = [25, 30, 35, 40, 45, 50, 55, 60];
const SALARY_OPTIONS = [120_000, 150_000, 180_000, 200_000, 250_000, 300_000, 400_000];

/* -------------------------------------------------------------------------- */
/*  Calculation engine                                                         */
/* -------------------------------------------------------------------------- */

interface SuperProjection {
  year: number;
  age: number;
  balanceNoExtra: number;
  balanceWithExtra: number;
}

/**
 * Contributions tax rate on concessional contributions: 15%, plus the
 * Division 293 extra 15% when income exceeds the threshold. Applied to
 * CONTRIBUTIONS — fund earnings are always taxed at EARNINGS_TAX.
 */
function contributionsTaxRate(salary: number): number {
  return salary > DIV293_THRESHOLD ? EARNINGS_TAX + DIV293_EXTRA : EARNINGS_TAX;
}

function calculateProjections(
  currentAge: number,
  currentBalance: number,
  salary: number,
  extraContribution: number, // annual concessional
  returnRate: number, // e.g. 0.07
  years: number = 35,
): SuperProjection[] {
  const sgContrib = salary * SG_RATE;
  const contribTax = contributionsTaxRate(salary);
  const data: SuperProjection[] = [];
  let balNoExtra = currentBalance;
  let balWithExtra = currentBalance;

  for (let y = 1; y <= years; y++) {
    const age = currentAge + y;
    // No-extra: just SG. Contribution tax is deducted from the CONTRIBUTION;
    // fund earnings are taxed separately at the accumulation earnings rate.
    const earningsNo = balNoExtra * returnRate;
    const taxNo = earningsNo * EARNINGS_TAX;
    balNoExtra = balNoExtra + earningsNo - taxNo + sgContrib * (1 - contribTax);

    // With extra: SG + voluntary (capped at the remaining concessional cap)
    // Shared, deterministically-tested clamp (test/super-contrib.test.js): when
    // SG alone already exceeds the cap the headroom must floor at zero, or the
    // with-extra projection dips below the SG-only baseline.
    const totalContrib = cappedTotalContribution(sgContrib, extraContribution, CONCESSIONAL_CAP);
    const earningsWith = balWithExtra * returnRate;
    const taxWith = earningsWith * EARNINGS_TAX;
    balWithExtra = balWithExtra + earningsWith - taxWith + totalContrib * (1 - contribTax);

    data.push({
      year: y,
      age,
      balanceNoExtra: Math.round(balNoExtra),
      balanceWithExtra: Math.round(balWithExtra),
    });
  }
  return data;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

function SuperOptimiser() {
  const [age, setAge] = useState(35);
  const [balance, setBalance] = useState(120_000);
  const [salary, setSalary] = useState(180_000);
  const [extra, setExtra] = useState(5_000);
  const [returnRate, setReturnRate] = useState(7);

  const projections = useMemo(
    () => calculateProjections(age, balance, salary, extra, returnRate / 100),
    [age, balance, salary, extra, returnRate],
  );

  const finalNoExtra = projections[projections.length - 1]?.balanceNoExtra ?? 0;
  const finalWithExtra = projections[projections.length - 1]?.balanceWithExtra ?? 0;
  const diff = finalWithExtra - finalNoExtra;

  const sgContrib = salary * SG_RATE;
  const remainingCap = remainingConcessionalCap(sgContrib, CONCESSIONAL_CAP);
  const effectiveExtra = Math.min(extra, remainingCap);
  // Marginal rate derived from the selected income via the shared FY-keyed
  // brackets (income tax + Medicare) — not a flat assumption.
  const marginalRate = combinedMarginalRate(salary);
  const contribTax = contributionsTaxRate(salary);
  const taxSaving = effectiveExtra * Math.max(0, marginalRate - contribTax);
  const isDiv293 = salary > DIV293_THRESHOLD;

  const chartData = projections.filter((_, i) => i % 2 === 0 || i === projections.length - 1);

  return (
    <section id="super-optimizer" className="scroll-mt-20 border-t border-hairline">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal className="max-w-2xl">
          <div className="flex items-center gap-3">
            <span className="section-number">🧮</span>
            <span className="text-xs font-medium uppercase tracking-widest text-mint">
              Super Optimiser
            </span>
          </div>
          <h2 className="mt-3 tracking-display text-3xl sm:text-4xl">
            Make every concessional dollar <span className="text-gradient-mint">count.</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            See how salary sacrificing even a small amount each year compounds
            over your career. The {formatAUD(CONCESSIONAL_CAP)} concessional cap
            is your best friend — don&apos;t leave it on the table.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-8 lg:grid-cols-[340px_1fr]">
          {/* Controls */}
          <Reveal delay={50}>
            <Card className="border-hairline p-5 space-y-5">
              <SliderWithInput
                label="Current age"
                value={age}
                onChange={setAge}
                min={18}
                max={75}
                step={1}
                hardMax={100}
                suffix="yrs"
              />

              <SliderWithInput
                label="Super balance"
                value={balance}
                onChange={setBalance}
                min={0}
                max={2_000_000}
                step={5_000}
                format={formatAUD}
                prefix="$"
              />

              <div className="space-y-2">
                <SliderWithInput
                  label="Taxable income"
                  value={salary}
                  onChange={setSalary}
                  min={0}
                  max={500_000}
                  step={5_000}
                  format={formatAUD}
                  prefix="$"
                />
                {isDiv293 && (
                  <p className="flex items-center gap-1.5 text-[11px] text-amber-500">
                    <AlertTriangle className="h-3 w-3" />
                    Division 293 applies ({Math.round(DIV293_EXTRA * 100)}% extra tax on contributions)
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <SliderWithInput
                  label="Extra concessional"
                  value={extra}
                  onChange={setExtra}
                  min={0}
                  max={CONCESSIONAL_CAP}
                  step={500}
                  format={(v) => `${formatAUD(v)}/yr`}
                  prefix="$"
                />
                {effectiveExtra < extra && (
                  <p className="text-[11px] text-amber-500">
                    Capped at {formatAUD(effectiveExtra)} — SG uses {formatAUD(sgContrib)} of your {formatAUD(CONCESSIONAL_CAP)} cap.
                  </p>
                )}
              </div>

              <SliderWithInput
                label="Expected return"
                value={returnRate}
                onChange={setReturnRate}
                min={0}
                max={12}
                step={0.5}
                hardMax={30}
                format={(v) => `${v}%`}
                suffix="%"
              />

              <div className="rounded-lg border border-hairline bg-surface-2/60 p-3 space-y-1.5 text-xs">
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <PiggyBank className="h-3.5 w-3.5 text-mint" />
                  SG contribution: <span className="ml-auto font-medium text-foreground">{formatAUD(sgContrib)}/yr</span>
                </p>
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5 text-mint" />
                  Remaining cap: <span className="ml-auto font-medium text-foreground">{formatAUD(remainingCap)}/yr</span>
                </p>
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Zap className="h-3.5 w-3.5 text-gold" />
                  Annual tax saved: <span className="ml-auto font-medium text-emerald-500">{formatAUD(taxSaving)}</span>
                </p>
              </div>
            </Card>
          </Reveal>

          {/* Projection chart */}
          <Reveal delay={100}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="tracking-display text-lg">Super projection to age {age + 35}</h3>
                <Badge variant="outline" className="text-[10px] gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-mint dot-pulse" /> Illustrative
                </Badge>
              </div>

              <div className="h-80 rounded-xl border border-hairline bg-card p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="superGradWith" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--mint)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--mint)" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="superGradNo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--muted-foreground)" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="var(--muted-foreground)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="age"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                      width={55}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value: number, name: string) => [
                        formatAUD(value),
                        name === "balanceWithExtra" ? "With extra" : "SG only",
                      ]}
                      labelFormatter={(label: number) => `Age ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="balanceNoExtra"
                      stroke="var(--muted-foreground)"
                      strokeWidth={2}
                      fill="url(#superGradNo)"
                      name="balanceNoExtra"
                    />
                    <Area
                      type="monotone"
                      dataKey="balanceWithExtra"
                      stroke="var(--mint)"
                      strokeWidth={2}
                      fill="url(#superGradWith)"
                      name="balanceWithExtra"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Summary cards */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-hairline bg-card p-4">
                  <p className="text-xs text-muted-foreground">SG only at age {age + 35}</p>
                  <p className="mt-1 tracking-display text-xl tabular-nums">{formatAUD(finalNoExtra)}</p>
                </div>
                <div className="rounded-xl border border-mint/30 bg-mint-soft/50 p-4">
                  <p className="text-xs text-muted-foreground">With extra at age {age + 35}</p>
                  <p className="mt-1 tracking-display text-xl tabular-nums text-mint">{formatAUD(finalWithExtra)}</p>
                </div>
                <div className="rounded-xl border border-hairline bg-card p-4">
                  <p className="text-xs text-muted-foreground">Extra from sacrificing</p>
                  <p className="mt-1 tracking-display text-xl tabular-nums text-emerald-500">
                    +{formatAUD(diff)}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-emerald-500">
                    <CheckCircle2 className="h-3 w-3" />
                    {((diff / finalNoExtra) * 100).toFixed(0)}% more
                  </p>
                </div>
              </div>

              <Disclaimer variant="inline" />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
