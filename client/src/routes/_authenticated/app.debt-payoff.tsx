import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Reveal } from "@/components/maal/Reveal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";
import {
  CreditCard,
  TrendingDown,
  Plus,
  Trash2,
  ArrowDownCircle,
  Loader2,
} from "lucide-react";
import { formatAUD } from "@/lib/score";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/debt-payoff")({
  component: DebtPayoff,
});

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface Debt {
  id: string;
  name: string;
  balance: number;
  rate: number; // annual percentage, e.g. 19.99
  minPayment: number;
}

interface MonthlySnapshot {
  month: number;
  label: string;
  total: number;
  [debtKey: string]: number | string;
}

interface DebtPayoffDetail {
  id: string;
  name: string;
  payoffMonth: number;
  payoffDate: string;
  totalInterest: number;
}

interface PayoffResult {
  snapshots: MonthlySnapshot[];
  totalInterest: number;
  debtFreeMonth: number;
  debtFreeDate: string;
  payoffOrder: DebtPayoffDetail[];
}

interface MinOnlyResult {
  totalInterest: number;
  totalMonths: number;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "maal:debts";

const DEBT_COLORS = [
  "var(--mint)",
  "var(--gold)",
  "var(--foreground)",
  "#f472b6",
  "#a78bfa",
  "#fb923c",
  "#38bdf8",
  "#4ade80",
];

const SAMPLE_DEBTS: Debt[] = [
  { id: "d_cc", name: "Credit Card", balance: 5000, rate: 19.99, minPayment: 150 },
  { id: "d_hecs", name: "HECS", balance: 25000, rate: 4.5, minPayment: 200 },
  { id: "d_car", name: "Car Loan", balance: 15000, rate: 6.5, minPayment: 300 },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function generateId(): string {
  return `d_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Coerce typed/pasted/stored values to a finite, non-negative number. */
function clampNonNegative(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function loadDebts(): Debt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Sanitize persisted rows so invalid stored values can't reach the engines
    return parsed
      .filter((d): d is Partial<Debt> => !!d && typeof d === "object")
      .map((d) => ({
        id: typeof d.id === "string" && d.id ? d.id : generateId(),
        name: typeof d.name === "string" ? d.name : "",
        balance: clampNonNegative(d.balance),
        rate: clampNonNegative(d.rate),
        minPayment: clampNonNegative(d.minPayment),
      }));
  } catch {
    return [];
  }
}

function saveDebts(debts: Debt[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(debts));
  } catch {
    /* storage full or unavailable */
  }
}

function monthLabel(monthOffset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthOffset);
  return d.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
}

function monthYear(monthOffset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthOffset);
  return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

/* -------------------------------------------------------------------------- */
/*  Calculation Engine (deterministic, no LLM)                                */
/* -------------------------------------------------------------------------- */

function calculatePayoff(
  debts: Debt[],
  extraPayment: number,
  strategy: "snowball" | "avalanche",
): PayoffResult {
  if (debts.length === 0) {
    return {
      snapshots: [],
      totalInterest: 0,
      debtFreeMonth: 0,
      debtFreeDate: "—",
      payoffOrder: [],
    };
  }

  // Working copies (clamped — no negative balance/rate/payment reaches the math)
  const balances = debts.map((d) => clampNonNegative(d.balance));
  const monthlyRates = debts.map((d) => clampNonNegative(d.rate) / 100 / 12);
  const minPayments = debts.map((d) => clampNonNegative(d.minPayment));
  const cumulativeInterest = debts.map(() => 0);
  const payoffMonth = debts.map(() => -1);

  // Sort order determines which debt gets extra payment first
  const indices = debts.map((_, i) => i);
  if (strategy === "snowball") {
    indices.sort((a, b) => balances[a] - balances[b]);
  } else {
    indices.sort((a, b) => monthlyRates[b] - monthlyRates[a]);
  }

  const snapshots: MonthlySnapshot[] = [];
  let month = 0;
  const maxMonths = 600; // safety cap (50 years)

  // Initial snapshot (month 0)
  {
    const snap: MonthlySnapshot = { month: 0, label: "Now", total: 0 };
    debts.forEach((_d, i) => {
      const key = `debt_${i}`;
      snap[key] = Math.round(balances[i]);
      snap.total += Math.round(balances[i]);
    });
    snap.total = Math.round(snap.total);
    snapshots.push(snap);
  }

  // Already debt-free — nothing to simulate
  if (balances.every((b) => b <= 0.01)) {
    return {
      snapshots,
      totalInterest: 0,
      debtFreeMonth: 0,
      debtFreeDate: "—",
      payoffOrder: [],
    };
  }

  while (month < maxMonths) {
    month++;

    // 1. Calculate interest and apply minimum payments
    let availableExtra = extraPayment;

    for (let i = 0; i < debts.length; i++) {
      if (balances[i] <= 0) continue;

      const interest = balances[i] * monthlyRates[i];
      cumulativeInterest[i] += interest;
      balances[i] += interest;

      // Pay minimum
      const payment = Math.min(minPayments[i], balances[i]);
      balances[i] -= payment;

      // Check if debt is paid off
      if (balances[i] <= 0.01) {
        // Rollover: any surplus from minimum payment goes to extra pool
        availableExtra += minPayments[i] - payment;
        // Also redirect this debt's future minimums to the extra pool
        balances[i] = 0;
        if (payoffMonth[i] === -1) {
          payoffMonth[i] = month;
        }
      }
    }

    // When a debt is paid off, redirect its minimum payment to the extra pool
    for (let i = 0; i < debts.length; i++) {
      if (payoffMonth[i] !== -1 && payoffMonth[i] < month) {
        if (balances[i] <= 0) {
          availableExtra += minPayments[i];
        }
      }
    }

    // 2. Apply extra payment to target debts in priority order
    for (const idx of indices) {
      if (availableExtra <= 0) break;
      if (balances[idx] <= 0) continue;

      const extra = Math.min(availableExtra, balances[idx]);
      balances[idx] -= extra;
      availableExtra -= extra;

      if (balances[idx] <= 0.01) {
        availableExtra += balances[idx] * -1; // refund overpayment
        // Do NOT re-add this debt's minimum here — it was already applied in
        // this month's minimum-payment loop above. The freed minimum only
        // rolls into the extra pool from the NEXT month (cleared-debt
        // rollover loop), so the same dollar is never spent twice.
        balances[idx] = 0;
        if (payoffMonth[idx] === -1) {
          payoffMonth[idx] = month;
        }
      }
    }

    // 3. Record snapshot (sample every month for up to 120 months, then every 3)
    const shouldRecord = month <= 120 || month % 3 === 0 || balances.every((b) => b <= 0.01);
    if (shouldRecord) {
      const snap: MonthlySnapshot = { month, label: monthLabel(month), total: 0 };
      debts.forEach((_, i) => {
        const key = `debt_${i}`;
        snap[key] = Math.round(balances[i]);
        snap.total += Math.round(balances[i]);
      });
      snap.total = Math.round(snap.total);
      snapshots.push(snap);
    }

    // 4. Check if all debts are paid off
    if (balances.every((b) => b <= 0.01)) {
      break;
    }
  }

  const debtFreeMonth = balances.every((b) => b <= 0.01) ? month : -1;
  const totalInterest = cumulativeInterest.reduce((s, v) => s + v, 0);

  // Build payoff order (sorted by payoff month ascending)
  const payoffOrder: DebtPayoffDetail[] = debts
    .map((d, i) => ({
      id: d.id,
      name: d.name,
      payoffMonth: payoffMonth[i],
      payoffDate: payoffMonth[i] > 0 ? monthYear(payoffMonth[i]) : "—",
      totalInterest: Math.round(cumulativeInterest[i]),
    }))
    .filter((d) => d.payoffMonth > 0)
    .sort((a, b) => a.payoffMonth - b.payoffMonth);

  return {
    snapshots,
    totalInterest: Math.round(totalInterest),
    debtFreeMonth,
    debtFreeDate: debtFreeMonth > 0 ? monthYear(debtFreeMonth) : "—",
    payoffOrder,
  };
}

function calculateMinOnly(debts: Debt[]): MinOnlyResult {
  if (debts.length === 0) return { totalInterest: 0, totalMonths: 0 };

  const balances = debts.map((d) => clampNonNegative(d.balance));
  const monthlyRates = debts.map((d) => clampNonNegative(d.rate) / 100 / 12);
  const minPayments = debts.map((d) => clampNonNegative(d.minPayment));
  const cumulativeInterest = debts.map(() => 0);
  const payoffMonth = debts.map(() => -1);

  // Already debt-free — nothing to simulate
  if (balances.every((b) => b <= 0.01)) {
    return { totalInterest: 0, totalMonths: 0 };
  }

  let month = 0;
  const maxMonths = 600;

  while (month < maxMonths) {
    month++;

    for (let i = 0; i < debts.length; i++) {
      if (balances[i] <= 0) continue;

      const interest = balances[i] * monthlyRates[i];
      cumulativeInterest[i] += interest;
      balances[i] += interest;

      // Pay minimum
      const payment = Math.min(minPayments[i], balances[i]);
      balances[i] -= payment;

      if (balances[i] <= 0.01) {
        balances[i] = 0;
        if (payoffMonth[i] === -1) {
          payoffMonth[i] = month;
        }
      }
    }

    // Check if all done
    if (balances.every((b) => b <= 0.01)) {
      break;
    }
  }

  const totalMonths = Math.max(...payoffMonth.filter((m) => m > 0), 0);
  const totalInterest = cumulativeInterest.reduce((s, v) => s + v, 0);

  return { totalInterest: Math.round(totalInterest), totalMonths };
}

/* -------------------------------------------------------------------------- */
/*  Custom Tooltip                                                            */
/* -------------------------------------------------------------------------- */

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
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-xs">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name.replace("debt_", "Debt ")}:</span>
          <span className="font-medium tabular-nums">{formatAUD(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

function DebtPayoff() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [extraPayment, setExtraPayment] = useState(500);
  const [strategy, setStrategy] = useState<"snowball" | "avalanche">("avalanche");
  const mountedRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount. Set state directly — a previous
  // requestAnimationFrame wrapper left the calculator stuck on "Loading…" in
  // non-foreground tabs (rAF is throttled/never fires there). This route is
  // client-only (ssr:false), so there's no hydration reason to defer.
  useEffect(() => {
    const stored = loadDebts();
    setDebts(stored.length > 0 ? stored : SAMPLE_DEBTS);
    setMounted(true);
    mountedRef.current = true;
  }, []);

  // Persist whenever debts change (after mount)
  useEffect(() => {
    if (mountedRef.current) {
      saveDebts(debts);
    }
  }, [debts]);

  // Calculation results
  const result = useMemo(
    () => calculatePayoff(debts, extraPayment, strategy),
    [debts, extraPayment, strategy],
  );

  const minOnlyResult = useMemo(() => calculateMinOnly(debts), [debts]);

  // Time saved
  const monthsSaved = useMemo(() => {
    if (result.debtFreeMonth <= 0 || minOnlyResult.totalMonths <= 0) return 0;
    return minOnlyResult.totalMonths - result.debtFreeMonth;
  }, [result.debtFreeMonth, minOnlyResult.totalMonths]);

  /* ---- Debt row handlers ---- */

  const addDebt = useCallback(() => {
    const newDebt: Debt = {
      id: generateId(),
      name: "",
      balance: 0,
      rate: 0,
      minPayment: 0,
    };
    setDebts((prev) => [...prev, newDebt]);
  }, []);

  const removeDebt = useCallback((id: string) => {
    setDebts((prev) => prev.filter((d) => d.id !== id));
    toast.success("Debt removed");
  }, []);

  const updateDebt = useCallback((id: string, field: keyof Debt, value: string | number) => {
    setDebts((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        // Numeric fields are clamped — typed/pasted negatives or NaN become 0
        if (field === "balance" || field === "rate" || field === "minPayment") {
          return { ...d, [field]: clampNonNegative(value) };
        }
        return { ...d, [field]: value };
      }),
    );
  }, []);

  /* ---- Chart data ---- */

  const chartData = useMemo(() => {
    return result.snapshots.map((snap) => {
      const entry: Record<string, number | string> = {
        month: snap.month,
        label: snap.label,
        total: snap.total,
      };
      debts.forEach((_, i) => {
        entry[`debt_${i}`] = (snap[`debt_${i}`] as number) || 0;
      });
      return entry;
    });
  }, [result.snapshots, debts]);

  /* ---- Render ---- */

  if (!mounted) {
    return (
      <section id="debt-payoff" className="scroll-mt-20 border-t border-hairline">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading calculator…
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="debt-payoff" className="scroll-mt-20 border-t border-hairline">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        {/* Header */}
        <Reveal className="max-w-2xl">
          <span className="text-xs font-medium uppercase tracking-widest text-mint">
            Debt Payoff Calculator
          </span>
          <h2 className="mt-3 tracking-display text-3xl sm:text-4xl">
            Crush your debt. See the path to freedom.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Compare the snowball and avalanche methods side-by-side. See exactly
            when you&apos;ll be debt-free and how much interest you&apos;ll save.
          </p>
        </Reveal>

        {/* Debt inputs */}
        <Reveal delay={100}>
          <Card className="mt-8 rounded-2xl border-hairline p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="tracking-display text-lg font-semibold">Your Debts</h3>
              <Button size="sm" variant="outline" className="gap-1.5 rounded-md" onClick={addDebt}>
                <Plus className="h-4 w-4" /> Add Debt
              </Button>
            </div>

            {/* Column headers */}
            <div className="mt-4 hidden gap-3 sm:grid sm:grid-cols-[1fr_100px_80px_100px_40px]">
              <span className="text-xs font-medium text-muted-foreground">Name</span>
              <span className="text-xs font-medium text-muted-foreground">Balance ($)</span>
              <span className="text-xs font-medium text-muted-foreground">Rate (%)</span>
              <span className="text-xs font-medium text-muted-foreground">Min Pmt ($)</span>
              <span />
            </div>

            {/* Debt rows */}
            <div className="mt-2 space-y-2">
              {debts.map((debt) => (
                <div
                  key={debt.id}
                  className="grid gap-2 sm:grid-cols-[1fr_100px_80px_100px_40px] sm:gap-3"
                >
                  <div className="flex items-center gap-2">
                    <CreditCard className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                    <Input
                      placeholder="e.g. Credit Card"
                      value={debt.name}
                      onChange={(e) => updateDebt(debt.id, "name", e.target.value)}
                      className="rounded-md"
                    />
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0"
                    value={debt.balance || ""}
                    onChange={(e) => updateDebt(debt.id, "balance", parseFloat(e.target.value) || 0)}
                    className="rounded-md tabular-nums"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0"
                    value={debt.rate || ""}
                    onChange={(e) => updateDebt(debt.id, "rate", parseFloat(e.target.value) || 0)}
                    className="rounded-md tabular-nums"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="10"
                    placeholder="0"
                    value={debt.minPayment || ""}
                    onChange={(e) => updateDebt(debt.id, "minPayment", parseFloat(e.target.value) || 0)}
                    className="rounded-md tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => removeDebt(debt.id)}
                    className="flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-gold"
                    aria-label="Remove debt"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            {debts.length === 0 && (
              <div className="mt-4 rounded-xl border border-dashed border-hairline p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No debts added. Click &quot;Add Debt&quot; to get started.
                </p>
              </div>
            )}
          </Card>
        </Reveal>

        {/* Strategy & Extra Payment Controls */}
        <Reveal delay={150}>
          <Card className="mt-4 rounded-2xl border-hairline p-5 sm:p-6">
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Strategy toggle */}
              <div>
                <Label className="text-sm font-medium">Repayment Strategy</Label>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant={strategy === "snowball" ? "default" : "outline"}
                    className="flex-1 gap-1.5 rounded-md"
                    onClick={() => setStrategy("snowball")}
                  >
                    <ArrowDownCircle className="h-4 w-4" />
                    Snowball
                  </Button>
                  <Button
                    size="sm"
                    variant={strategy === "avalanche" ? "default" : "outline"}
                    className="flex-1 gap-1.5 rounded-md"
                    onClick={() => setStrategy("avalanche")}
                  >
                    <TrendingDown className="h-4 w-4" />
                    Avalanche
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {strategy === "snowball"
                    ? "Pay smallest balance first — quick wins to stay motivated."
                    : "Pay highest interest first — mathematically saves the most."}
                </p>
              </div>

              {/* Extra payment */}
              <div>
                <Label className="text-sm font-medium">
                  Extra Monthly Payment:{" "}
                  <span className="text-mint tabular-nums">{formatAUD(extraPayment)}</span>
                </Label>
                <Slider
                  value={[extraPayment]}
                  min={0}
                  max={3000}
                  step={25}
                  onValueChange={([v]) => setExtraPayment(v)}
                  className="mt-4"
                />
                <div className="mt-1 flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>$0</span>
                  <span>$3,000</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="25"
                    value={extraPayment}
                    onChange={(e) => setExtraPayment(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-24 rounded-md tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground">AUD / month</span>
                </div>
              </div>
            </div>
          </Card>
        </Reveal>

        {/* Summary Cards */}
        {debts.length > 0 && (
          <Reveal delay={200}>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
              <Card className="rounded-xl border-hairline p-4 text-center sm:p-6">
                <p className="text-xs text-muted-foreground">Debt-Free Date</p>
                <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl text-mint">
                  {result.debtFreeDate}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.debtFreeMonth > 0
                    ? `${result.debtFreeMonth} month${result.debtFreeMonth === 1 ? "" : "s"} from now`
                    : "Add debts above"}
                </p>
              </Card>
              <Card className="rounded-xl border-hairline p-4 text-center sm:p-6">
                <p className="text-xs text-muted-foreground">Total Interest Paid</p>
                <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl text-gold">
                  {formatAUD(result.totalInterest)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  With {strategy === "snowball" ? "snowball" : "avalanche"} strategy
                </p>
              </Card>
              <Card className="rounded-xl border-hairline p-4 text-center sm:p-6">
                <p className="text-xs text-muted-foreground">Time Saved</p>
                <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl text-mint">
                  {monthsSaved > 0 ? `${monthsSaved} mo` : "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  vs minimum-only payments ({minOnlyResult.totalMonths} mo)
                </p>
              </Card>
            </div>
          </Reveal>
        )}

        {/* Stacked Bar Chart */}
        {debts.length > 0 && chartData.length > 1 && (
          <Reveal delay={250}>
            <Card className="mt-8 rounded-2xl border-hairline p-5 sm:p-6">
              <h3 className="tracking-display text-lg font-semibold">Debt Payoff Timeline</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Remaining balance per debt over time —{" "}
                <span className="capitalize">{strategy}</span> method
              </p>
              <div className="mt-4 h-72 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      formatter={(value: string) => {
                        const idx = parseInt(value.replace("debt_", ""), 10);
                        const name = debts[idx]?.name || value;
                        return name;
                      }}
                    />
                    {debts.map((_, i) => (
                      <Bar
                        key={`debt_${i}`}
                        dataKey={`debt_${i}`}
                        stackId="a"
                        fill={DEBT_COLORS[i % DEBT_COLORS.length]}
                        radius={i === debts.length - 1 ? [4, 4, 0, 0] : undefined}
                      >
                        {chartData.map((_, cellIdx) => (
                          <Cell key={`cell-${i}-${cellIdx}`} fill={DEBT_COLORS[i % DEBT_COLORS.length]} />
                        ))}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Reveal>
        )}

        {/* Payoff Order List */}
        {result.payoffOrder.length > 0 && (
          <Reveal delay={300}>
            <Card className="mt-8 rounded-2xl border-hairline p-5 sm:p-6">
              <h3 className="tracking-display text-lg font-semibold">Payoff Order</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                The order your debts will be cleared —{" "}
                <span className="capitalize">{strategy}</span> method prioritises{" "}
                {strategy === "snowball" ? "smallest balance" : "highest interest rate"}.
              </p>
              <div className="mt-4 space-y-3">
                {result.payoffOrder.map((debt, idx) => (
                  <div
                    key={debt.id}
                    className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-2/40 p-3 sm:p-4"
                  >
                    {/* Rank indicator */}
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                        idx === 0
                          ? "bg-mint text-white"
                          : idx === 1
                            ? "bg-mint-soft text-mint"
                            : "bg-surface-2 text-muted-foreground"
                      }`}
                    >
                      {idx + 1}
                    </div>

                    {/* Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{debt.name}</p>
                        {idx === 0 && (
                          <Badge className="rounded-md bg-mint text-white text-[10px]">Paid first</Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                        <span>Payoff: {debt.payoffDate}</span>
                        <span>Interest: {formatAUD(debt.totalInterest)}</span>
                      </div>
                    </div>

                    {/* Arrow indicator */}
                    <ArrowDownCircle
                      className={`h-5 w-5 shrink-0 ${idx === 0 ? "text-mint" : "text-muted-foreground"}`}
                    />
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>
        )}

        {/* Disclaimer */}
        <Reveal delay={350}>
          <p className="mt-6 text-center text-xs text-muted-foreground italic">
            Educational illustration only — actual repayment may vary. Not financial advice.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
