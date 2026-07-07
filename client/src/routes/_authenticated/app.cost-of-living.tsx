import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Reveal } from "@/components/maal/Reveal";
import { Disclaimer } from "@/components/maal/Disclaimer";
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
  MapPin,
  Home,
  Car,
  ShoppingCart,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import { formatAUD } from "@/lib/score";

export const Route = createFileRoute("/_authenticated/app/cost-of-living")({
  component: CostOfLivingComparator,
});

/* -------------------------------------------------------------------------- */
/*  City data (illustrative, derived from ABS/SQM/CoreLogic 2024 estimates)    */
/* -------------------------------------------------------------------------- */

interface CityCost {
  id: string;
  name: string;
  state: string;
  emoji: string;
  medianHouse: number;
  rent2br: number;
  groceries: number;
  transport: number;
  healthInsurance: number;
  // salary modifier — Sydney multiplier is 1.0, others relative
  salaryMultiplier: number;
  // quality of life (1-100)
  qol: number;
}

const CITIES: CityCost[] = [
  { id: "sydney", name: "Sydney", state: "NSW", emoji: "🌉", medianHouse: 1_400_000, rent2br: 720, groceries: 1_200, transport: 220, healthInsurance: 320, salaryMultiplier: 1.1, qol: 78 },
  { id: "melbourne", name: "Melbourne", state: "VIC", emoji: "☕", medianHouse: 920_000, rent2br: 580, groceries: 1_150, transport: 200, healthInsurance: 310, salaryMultiplier: 1.05, qol: 82 },
  { id: "brisbane", name: "Brisbane", state: "QLD", emoji: "🌴", medianHouse: 870_000, rent2br: 540, groceries: 1_100, transport: 195, healthInsurance: 305, salaryMultiplier: 1.0, qol: 84 },
  { id: "perth", name: "Perth", state: "WA", emoji: "🌅", medianHouse: 680_000, rent2br: 490, groceries: 1_180, transport: 210, healthInsurance: 300, salaryMultiplier: 1.02, qol: 83 },
  { id: "adelaide", name: "Adelaide", state: "SA", emoji: "🍷", medianHouse: 660_000, rent2br: 460, groceries: 1_080, transport: 185, healthInsurance: 295, salaryMultiplier: 0.95, qol: 81 },
  { id: "canberra", name: "Canberra", state: "ACT", emoji: "🏛️", medianHouse: 950_000, rent2br: 620, groceries: 1_220, transport: 200, healthInsurance: 315, salaryMultiplier: 1.15, qol: 86 },
  { id: "hobart", name: "Hobart", state: "TAS", emoji: "⛰️", medianHouse: 580_000, rent2br: 430, groceries: 1_050, transport: 175, healthInsurance: 290, salaryMultiplier: 0.92, qol: 80 },
  { id: "darwin", name: "Darwin", state: "NT", emoji: "🐊", medianHouse: 520_000, rent2br: 470, groceries: 1_350, transport: 220, healthInsurance: 320, salaryMultiplier: 1.08, qol: 75 },
];

const BASE_SALARY = 95_000; // median AU full-time salary

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

interface CostCategory {
  label: string;
  icon: React.ElementType;
  field: "medianHouse" | "rent2br" | "groceries" | "transport" | "healthInsurance";
  format: "AUD" | "monthly";
  annualMultiplier?: number;
}

const CATEGORIES: CostCategory[] = [
  { label: "Median house", icon: Home, field: "medianHouse", format: "AUD" },
  { label: "Rent (2br)", icon: Home, field: "rent2br", format: "monthly", annualMultiplier: 12 },
  { label: "Groceries", icon: ShoppingCart, field: "groceries", format: "monthly", annualMultiplier: 12 },
  { label: "Transport", icon: Car, field: "transport", format: "monthly", annualMultiplier: 12 },
  { label: "Health insurance", icon: Stethoscope, field: "healthInsurance", format: "monthly", annualMultiplier: 12 },
];

function formatValue(city: CityCost, cat: CostCategory): string {
  const value = city[cat.field];
  if (cat.format === "AUD") return formatAUD(value);
  return `${formatAUD(value)}/mo`;
}

function CostOfLivingComparator() {
  const [cityA, setCityA] = useState("sydney");
  const [cityB, setCityB] = useState("brisbane");

  const a = useMemo(() => CITIES.find((c) => c.id === cityA)!, [cityA]);
  const b = useMemo(() => CITIES.find((c) => c.id === cityB)!, [cityB]);

  const aSalary = BASE_SALARY * a.salaryMultiplier;
  const bSalary = BASE_SALARY * b.salaryMultiplier;

  const aAnnualLiving =
    a.rent2br * 12 + a.groceries * 12 + a.transport * 12 + a.healthInsurance * 12;
  const bAnnualLiving =
    b.rent2br * 12 + b.groceries * 12 + b.transport * 12 + b.healthInsurance * 12;

  const aSurplus = aSalary - aAnnualLiving;
  const bSurplus = bSalary - bAnnualLiving;

  const diff = bSurplus - aSurplus;
  const winner = diff > 0 ? "b" : diff < 0 ? "a" : "tie";

  return (
    <section id="cost-of-living" className="scroll-mt-20 border-t border-hairline bg-surface-2/30">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal className="max-w-2xl">
          <div className="flex items-center gap-3">
            <span className="section-number">🏙️</span>
            <span className="eyebrow-bullet">Cost of Living Comparator</span>
          </div>
          <h2 className="mt-3 tracking-display text-3xl sm:text-4xl">
            Sydney vs Brisbane — <span className="text-gradient-mint">where does your money go further?</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Compare two AU cities side-by-side. Salary multipliers reflect local
            pay rates. Cost figures are illustrative 2024 estimates.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {/* City A */}
          <Reveal>
            <Card className="border-hairline p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{a.emoji}</span>
                  <div>
                    <Select value={cityA} onValueChange={setCityA}>
                      <SelectTrigger className="rounded-md border-0 p-0 h-auto focus:ring-0 text-lg tracking-display">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CITIES.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.emoji} {c.name}, {c.state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{a.state}</p>
                  </div>
                </div>
                <Badge variant="outline" className="gap-1">
                  <MapPin className="h-3 w-3" /> QoL: {a.qol}/100
                </Badge>
              </div>

              <div className="mt-5 grid gap-2">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <div
                      key={cat.field}
                      className="flex items-center justify-between rounded-lg border border-hairline bg-card px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-mint" />
                        <span className="text-xs text-muted-foreground">{cat.label}</span>
                      </div>
                      <span className="text-xs font-medium tabular-nums">{formatValue(a, cat)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Local salary (est.)</span>
                  <span className="text-sm font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatAUD(aSalary)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-rose-50 dark:bg-rose-900/20 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Annual living costs</span>
                  <span className="text-sm font-medium tabular-nums text-rose-500">
                    {formatAUD(aAnnualLiving)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-mint/30 bg-mint-soft px-3 py-2">
                  <span className="text-xs font-medium text-muted-foreground">Annual surplus</span>
                  <span className="tracking-display text-base tabular-nums text-mint">
                    {formatAUD(aSurplus)}
                  </span>
                </div>
              </div>
            </Card>
          </Reveal>

          {/* City B */}
          <Reveal delay={50}>
            <Card className={`border p-6 ${winner === "b" ? "border-mint soft-glow" : "border-hairline"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{b.emoji}</span>
                  <div>
                    <Select value={cityB} onValueChange={setCityB}>
                      <SelectTrigger className="rounded-md border-0 p-0 h-auto focus:ring-0 text-lg tracking-display">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CITIES.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.emoji} {c.name}, {c.state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{b.state}</p>
                  </div>
                </div>
                <Badge variant="outline" className="gap-1">
                  <MapPin className="h-3 w-3" /> QoL: {b.qol}/100
                </Badge>
              </div>

              <div className="mt-5 grid gap-2">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const aVal = a[cat.field];
                  const bVal = b[cat.field];
                  const better = bVal < aVal;
                  return (
                    <div
                      key={cat.field}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                        better
                          ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10"
                          : "border-rose-200 bg-rose-50/50 dark:bg-rose-900/10"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`h-3.5 w-3.5 ${better ? "text-emerald-500" : "text-rose-500"}`} />
                        <span className="text-xs text-muted-foreground">{cat.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium tabular-nums">{formatValue(b, cat)}</span>
                        {better ? (
                          <TrendingDown className="h-3 w-3 text-emerald-500" />
                        ) : bVal > aVal ? (
                          <TrendingUp className="h-3 w-3 text-rose-500" />
                        ) : (
                          <Minus className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Local salary (est.)</span>
                  <span className="text-sm font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatAUD(bSalary)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-rose-50 dark:bg-rose-900/20 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Annual living costs</span>
                  <span className="text-sm font-medium tabular-nums text-rose-500">
                    {formatAUD(bAnnualLiving)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-mint/30 bg-mint-soft px-3 py-2">
                  <span className="text-xs font-medium text-muted-foreground">Annual surplus</span>
                  <span className="tracking-display text-base tabular-nums text-mint">
                    {formatAUD(bSurplus)}
                  </span>
                </div>
              </div>
            </Card>
          </Reveal>
        </div>

        {/* Verdict */}
        <Reveal delay={100}>
          <Card
            className={`mt-6 border p-6 ${
              winner === "a"
                ? "border-foreground/30 bg-card"
                : winner === "b"
                  ? "border-mint soft-glow bg-card"
                  : "border-hairline bg-card"
            }`}
          >
            <div className="flex flex-col items-center text-center sm:flex-row sm:text-left">
              <div className="mr-0 mb-3 sm:mr-4 sm:mb-0">
                <span className="text-3xl">{winner === "a" ? a.emoji : winner === "b" ? b.emoji : "🤝"}</span>
              </div>
              <div className="flex-1">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Verdict</p>
                {winner === "tie" ? (
                  <p className="mt-1 tracking-display text-lg">
                    Both cities offer an identical annual surplus.
                  </p>
                ) : (
                  <p className="mt-1 tracking-display text-lg">
                    <strong className="text-gradient-mint">{winner === "a" ? a.name : b.name}</strong>{" "}
                    leaves you <strong className="text-emerald-500">{formatAUD(Math.abs(diff))}</strong> better off per year,
                    despite a{" "}
                    {winner === "a"
                      ? aSalary > bSalary
                        ? "higher"
                        : "lower"
                      : bSalary > aSalary
                        ? "higher"
                        : "lower"}{" "}
                    salary.
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Salary differentials often don&apos;t offset cost-of-living gaps —
                  especially housing. Run your own numbers before relocating.
                </p>
              </div>
            </div>
          </Card>
        </Reveal>

        <Reveal delay={150}>
          <Disclaimer variant="inline" />
        </Reveal>
      </div>
    </section>
  );
}
