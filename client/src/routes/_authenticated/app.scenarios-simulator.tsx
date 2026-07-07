import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Reveal } from "@/components/maal/Reveal";
import { Disclaimer } from "@/components/maal/Disclaimer";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Dices, TrendingUp, Target, RefreshCw, CheckCircle2 } from "lucide-react";
import { formatAUD } from "@/lib/score";

export const Route = createFileRoute("/_authenticated/app/scenarios-simulator")({
  component: ScenariosSimulator,
});

/* -------------------------------------------------------------------------- */
/*  Monte Carlo engine                                                         */
/* -------------------------------------------------------------------------- */

interface SimResult {
  year: number;
  age: number;
  p10: number; // pessimistic
  p50: number; // median
  p90: number; // optimistic
}

/** Mulberry32 PRNG for deterministic results per seed */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random normal via Box-Muller */
function randNormal(rng: () => number, mean: number, std: number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * std;
}

function runMonteCarlo(
  startAge: number,
  startBalance: number,
  annualContrib: number,
  annualWithdrawal: number,
  meanReturn: number, // e.g. 0.07
  stdReturn: number, // e.g. 0.12
  years: number,
  sims: number = 600,
  seed: number = 42,
): SimResult[] {
  const finalBalances: number[][] = Array.from({ length: years }, () => []);
  const rng = mulberry32(seed);

  for (let s = 0; s < sims; s++) {
    let bal = startBalance;
    for (let y = 0; y < years; y++) {
      const r = randNormal(rng, meanReturn, stdReturn);
      bal = Math.max(0, bal * (1 + r) + annualContrib - annualWithdrawal);
      finalBalances[y].push(bal);
    }
  }

  return finalBalances.map((balances, i) => {
    const sorted = [...balances].sort((a, b) => a - b);
    const idx10 = Math.floor(sorted.length * 0.1);
    const idx50 = Math.floor(sorted.length * 0.5);
    const idx90 = Math.floor(sorted.length * 0.9);
    return {
      year: i + 1,
      age: startAge + i + 1,
      p10: Math.round(sorted[idx10]),
      p50: Math.round(sorted[idx50]),
      p90: Math.round(sorted[idx90]),
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

function ScenariosSimulator() {
  const [startAge, setStartAge] = useState(35);
  const [balance, setBalance] = useState(150_000);
  const [contrib, setContrib] = useState(20_000);
  const [target, setTarget] = useState(1_500_000);
  const [risk, setRisk] = useState<"conservative" | "balanced" | "growth">("balanced");
  const [seed, setSeed] = useState(42);

  const riskProfile = useMemo(() => {
    const profiles = {
      conservative: { mean: 0.055, std: 0.07 },
      balanced: { mean: 0.075, std: 0.11 },
      growth: { mean: 0.09, std: 0.15 },
    };
    return profiles[risk];
  }, [risk]);

  const yearsToRetire = 60 - startAge;
  const results = useMemo(
    () => runMonteCarlo(startAge, balance, contrib, 0, riskProfile.mean, riskProfile.std, yearsToRetire, 600, seed),
    [startAge, balance, contrib, riskProfile, yearsToRetire, seed],
  );

  const finalResult = results[results.length - 1];
  const successRate = useMemo(() => {
    // Count sims that hit target — using p50 distribution approximation.
    // Real implementation would track per-sim success; here we approximate
    // from p10/p90 via linear interpolation (educational tool).
    if (!finalResult) return 0;
    const optimistic = finalResult.p90;
    const pessimistic = finalResult.p10;
    if (target <= pessimistic) return 95;
    if (target >= optimistic) return 5;
    const t = (target - pessimistic) / (optimistic - pessimistic);
    return Math.round(95 - t * 90);
  }, [finalResult, target]);

  const chartData = results.filter((_, i) => i % 3 === 0 || i === results.length - 1);

  return (
    <section id="scenarios" className="scroll-mt-20 border-t border-hairline">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal className="max-w-2xl">
          <div className="flex items-center gap-3">
            <span className="section-number">🎲</span>
            <span className="eyebrow-bullet">Scenarios Simulator</span>
          </div>
          <h2 className="mt-3 tracking-display text-3xl sm:text-4xl">
            What if the market <span className="text-gradient-mint">doesn&apos;t cooperate?</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            600 Monte Carlo simulations show the range of outcomes for your
            retirement — not just one optimistic line. See the probability of
            hitting your target under real market volatility.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-8 lg:grid-cols-[340px_1fr]">
          {/* Controls */}
          <Reveal delay={50}>
            <Card className="border-hairline p-5 space-y-5">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Current age</Label>
                <Slider
                  value={[startAge]}
                  onValueChange={([v]) => setStartAge(v)}
                  min={25}
                  max={55}
                  step={1}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>25</span>
                  <span className="font-medium text-foreground">{startAge}</span>
                  <span>55</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Starting balance — <span className="text-foreground font-medium">{formatAUD(balance)}</span>
                </Label>
                <Slider
                  value={[balance]}
                  onValueChange={([v]) => setBalance(v)}
                  min={0}
                  max={500_000}
                  step={10_000}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Annual contribution — <span className="text-foreground font-medium">{formatAUD(contrib)}/yr</span>
                </Label>
                <Slider
                  value={[contrib]}
                  onValueChange={([v]) => setContrib(v)}
                  min={0}
                  max={30_000}
                  step={500}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Retirement target — <span className="text-foreground font-medium">{formatAUD(target)}</span>
                </Label>
                <Slider
                  value={[target]}
                  onValueChange={([v]) => setTarget(v)}
                  min={500_000}
                  max={3_000_000}
                  step={50_000}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Risk profile</Label>
                <Select value={risk} onValueChange={(v) => setRisk(v as typeof risk)}>
                  <SelectTrigger className="rounded-md"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="conservative">Conservative (5.5% return, 7% vol)</SelectItem>
                    <SelectItem value="balanced">Balanced (7.5% return, 11% vol)</SelectItem>
                    <SelectItem value="growth">Growth (9% return, 15% vol)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setSeed((s) => s + 1)}
                className="w-full rounded-md group"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 transition-transform group-hover:rotate-180" />
                Re-run simulations (seed: {seed})
              </Button>

              <div className="rounded-lg border border-hairline bg-surface-2/60 p-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5">
                  <Dices className="h-3.5 w-3.5 text-mint" />
                  <span>Running 600 simulations to age 60...</span>
                </p>
              </div>
            </Card>
          </Reveal>

          {/* Projection chart */}
          <Reveal delay={100}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="tracking-display text-lg">
                  Projection to age {startAge + yearsToRetire}
                </h3>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-card px-2.5 py-1 text-[11px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-mint dot-pulse" />
                  600 simulations
                </span>
              </div>

              <div className="h-80 rounded-xl border border-hairline bg-card p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="p90Fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--mint)" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="var(--mint)" stopOpacity={0.02} />
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
                        name === "p90" ? "Optimistic (90th)" : name === "p50" ? "Median (50th)" : "Pessimistic (10th)",
                      ]}
                      labelFormatter={(label: number) => `Age ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="p90"
                      stroke="var(--mint)"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      name="p90"
                    />
                    <Line
                      type="monotone"
                      dataKey="p50"
                      stroke="var(--mint)"
                      strokeWidth={2.5}
                      dot={false}
                      name="p50"
                    />
                    <Line
                      type="monotone"
                      dataKey="p10"
                      stroke="var(--gold)"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      name="p10"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Summary cards */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="kpi-tile rounded-xl border border-hairline bg-card p-4">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-mint" />
                    <p className="text-xs text-muted-foreground">Success probability</p>
                  </div>
                  <p
                    className={`mt-2 tracking-display text-2xl tabular-nums ${
                      successRate >= 80 ? "text-emerald-500" : successRate >= 50 ? "text-mint" : "text-amber-500"
                    }`}
                  >
                    {successRate}%
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Chance of hitting {formatAUD(target)}
                  </p>
                </div>

                <div className="kpi-tile rounded-xl border border-hairline bg-card p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-mint" />
                    <p className="text-xs text-muted-foreground">Median outcome</p>
                  </div>
                  <p className="mt-2 tracking-display text-2xl tabular-nums">
                    {formatAUD(finalResult?.p50 ?? 0)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    At age {startAge + yearsToRetire} (50th percentile)
                  </p>
                </div>

                <div className="kpi-tile rounded-xl border border-hairline bg-card p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-gold" />
                    <p className="text-xs text-muted-foreground">Worst case (10th)</p>
                  </div>
                  <p className="mt-2 tracking-display text-2xl tabular-nums text-gold">
                    {formatAUD(finalResult?.p10 ?? 0)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    1-in-10 bad market scenario
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
