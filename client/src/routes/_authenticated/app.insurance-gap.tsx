import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Reveal } from "@/components/maal/Reveal";
import { Disclaimer } from "@/components/maal/Disclaimer";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  HeartPulse,
  AlertTriangle,
  CheckCircle2,
  Users,
  Home,
  GraduationCap,
} from "lucide-react";
import { formatAUD } from "@/lib/score";

export const Route = createFileRoute("/_authenticated/app/insurance-gap")({
  component: InsuranceGap,
});

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const MEDIAN_DOCTOR_INCOME = 200_000;

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

function InsuranceGap() {
  const [age, setAge] = useState(38);
  const [income, setIncome] = useState(180_000);
  const [dependants, setDependants] = useState(2);
  const [mortgage, setMortgage] = useState(450_000);
  const [existingCover, setExistingCover] = useState(300_000);
  const [coverType, setCoverType] = useState<"life" | "tpd" | "income">("life");

  const needs = useMemo(() => {
    const incomeReplace = income * 5; // 5 years of income
    const education = dependants * 100_000;
    const emergency = 30_000;
    const total = incomeReplace + mortgage + education + emergency;
    return { incomeReplace, mortgage, education, emergency, total };
  }, [income, mortgage, dependants]);

  const gap = Math.max(0, needs.total - existingCover);
  const surplus = Math.max(0, existingCover - needs.total);
  const gapPct = needs.total > 0 ? (gap / needs.total) * 100 : 0;

  const coverTypeLabel = {
    life: "Life Insurance",
    tpd: "Total & Permanent Disability",
    income: "Income Protection",
  }[coverType];

  return (
    <section id="insurance-gap" className="scroll-mt-20 border-t border-hairline bg-surface-2/30">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal className="max-w-2xl">
          <div className="flex items-center gap-3">
            <span className="section-number">🛡️</span>
            <span className="eyebrow-bullet">Insurance Gap Calculator</span>
          </div>
          <h2 className="mt-3 tracking-display text-3xl sm:text-4xl">
            Is your family <span className="text-gradient-mint">actually covered?</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Most clinicians have default super-based cover — usually far too low for
            their income and dependants. Calculate your real life/TPD gap in 30 seconds.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-8 lg:grid-cols-[340px_1fr]">
          {/* Controls */}
          <Reveal delay={50}>
            <Card className="border-hairline p-5 space-y-5">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Age — <span className="text-foreground font-medium">{age}</span>
                </Label>
                <Slider value={[age]} onValueChange={([v]) => setAge(v)} min={25} max={60} step={1} />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Annual income — <span className="text-foreground font-medium">{formatAUD(income)}</span>
                </Label>
                <Slider
                  value={[income]}
                  onValueChange={([v]) => setIncome(v)}
                  min={80_000}
                  max={500_000}
                  step={10_000}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Dependants — <span className="text-foreground font-medium">{dependants}</span>
                </Label>
                <Slider value={[dependants]} onValueChange={([v]) => setDependants(v)} min={0} max={5} step={1} />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Mortgage — <span className="text-foreground font-medium">{formatAUD(mortgage)}</span>
                </Label>
                <Slider
                  value={[mortgage]}
                  onValueChange={([v]) => setMortgage(v)}
                  min={0}
                  max={1_500_000}
                  step={50_000}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Existing cover (super + standalone) —{" "}
                  <span className="text-foreground font-medium">{formatAUD(existingCover)}</span>
                </Label>
                <Slider
                  value={[existingCover]}
                  onValueChange={([v]) => setExistingCover(v)}
                  min={0}
                  max={2_000_000}
                  step={50_000}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Cover type</Label>
                <Select value={coverType} onValueChange={(v) => setCoverType(v as typeof coverType)}>
                  <SelectTrigger className="rounded-md"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="life">Life Insurance</SelectItem>
                    <SelectItem value="tpd">Total & Permanent Disability (TPD)</SelectItem>
                    <SelectItem value="income">Income Protection</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border border-hairline bg-surface-2/60 p-3 space-y-1.5 text-xs">
                <p className="flex items-center justify-between text-muted-foreground">
                  <span>Median AU doctor income</span>
                  <span className="font-medium text-foreground">{formatAUD(MEDIAN_DOCTOR_INCOME)}</span>
                </p>
                <p className="text-[10px] text-muted-foreground">Source: ABS + AMA. For awareness only.</p>
              </div>
            </Card>
          </Reveal>

          {/* Results */}
          <Reveal delay={100}>
            <div className="space-y-4">
              {/* Big gap headline */}
              <Card
                className={`relative overflow-hidden border p-6 ${
                  gap > 0
                    ? "border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-900/10"
                    : "border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-900/10"
                }`}
              >
                <div className="flex items-start gap-4">
                  <span
                    className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${
                      gap > 0 ? "bg-amber-100 dark:bg-amber-900/30" : "bg-emerald-100 dark:bg-emerald-900/30"
                    }`}
                  >
                    {gap > 0 ? (
                      <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    )}
                  </span>
                  <div className="flex-1">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      {coverTypeLabel} gap
                    </p>
                    {gap > 0 ? (
                      <>
                        <p className="mt-1 tracking-display text-3xl tabular-nums text-amber-600 dark:text-amber-400">
                          {formatAUD(gap)}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          You are <strong>{gapPct.toFixed(0)}% under-covered</strong> for your income,
                          dependants, and mortgage.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mt-1 tracking-display text-3xl tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatAUD(surplus)} surplus
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Your cover exceeds estimated needs. Review your premiums.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </Card>

              {/* Needs breakdown */}
              <div>
                <h3 className="mb-3 tracking-display text-base">Where the number comes from</h3>
                <div className="space-y-2">
                  {[
                    { label: "Income replacement (5× annual)", amount: needs.incomeReplace, icon: Users },
                    { label: "Mortgage payoff", amount: needs.mortgage, icon: Home },
                    { label: `Children education (${dependants} × $100k)`, amount: needs.education, icon: GraduationCap },
                    { label: "Emergency / final expenses", amount: needs.emergency, icon: HeartPulse },
                  ].map((item) => {
                    const Icon = item.icon;
                    const pct = (item.amount / needs.total) * 100;
                    return (
                      <div key={item.label} className="rounded-lg border border-hairline bg-card p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5 text-mint" />
                            <span className="text-xs text-muted-foreground">{item.label}</span>
                          </div>
                          <span className="text-xs font-medium tabular-nums">{formatAUD(item.amount)}</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-mint transition-all duration-700"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total row */}
                <div className="mt-3 flex items-center justify-between rounded-lg border border-mint/30 bg-mint-soft/50 p-4">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Total cover needed</p>
                    <p className="mt-0.5 tracking-display text-xl tabular-nums">{formatAUD(needs.total)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Existing</p>
                    <p className="mt-0.5 tracking-display text-xl tabular-nums">{formatAUD(existingCover)}</p>
                  </div>
                </div>
              </div>

              {/* Recommendations */}
              <div className="rounded-xl border border-hairline bg-card p-5">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-mint" />
                  <h3 className="tracking-display text-base">Recommendations</h3>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {gap > 0 && (
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-mint" />
                      <span>
                        Increase {coverTypeLabel} by <strong className="text-foreground">{formatAUD(gap)}</strong> —
                        typically cheapest inside super (auto-deducted, pre-tax).
                      </span>
                    </li>
                  )}
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-mint" />
                    <span>Check if your super fund offers <strong>income protection</strong> (75% of salary for 2 yrs).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-mint" />
                    <span>Own-occupation TPD is more expensive but pays out even if you can return to other work.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-mint" />
                    <span>Salary continuance may already be active — check your super member portal.</span>
                  </li>
                </ul>
              </div>

              <Disclaimer variant="inline" />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
