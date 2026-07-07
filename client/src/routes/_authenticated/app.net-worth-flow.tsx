import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Reveal } from "@/components/maal/Reveal";
import { Disclaimer } from "@/components/maal/Disclaimer";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { formatAUD } from "@/lib/score";
import { ArrowDown, Wallet, TrendingDown, PiggyBank, Building2, Heart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/net-worth-flow")({
  component: NetWorthFlow,
});

/* -------------------------------------------------------------------------- */
/*  Types & utilities                                                          */
/* -------------------------------------------------------------------------- */

interface FlowNode {
  id: string;
  label: string;
  amount: number;
  type: "income" | "expense" | "saving" | "asset";
  icon: React.ElementType;
}

interface FlowLink {
  from: string;
  to: string;
  amount: number;
}

/** Build a flow diagram for net-worth composition. */
function buildFlow(inputs: {
  salary: number;
  locum: number;
  mortgage: number;
  living: number;
  transport: number;
  lifestyle: number;
  super: number;
  investments: number;
  savings: number;
  propertyEquity: number;
}) {
  const income = inputs.salary + inputs.locum;
  const expenses = inputs.mortgage + inputs.living + inputs.transport + inputs.lifestyle;
  const savings = inputs.super + inputs.investments + inputs.savings;

  const nodes: FlowNode[] = [
    { id: "salary", label: "Salary", amount: inputs.salary, type: "income", icon: Wallet },
    { id: "locum", label: "Locum", amount: inputs.locum, type: "income", icon: Wallet },
    { id: "income", label: "Income", amount: income, type: "income", icon: Wallet },
    { id: "mortgage", label: "Mortgage", amount: inputs.mortgage, type: "expense", icon: Building2 },
    { id: "living", label: "Living", amount: inputs.living, type: "expense", icon: Heart },
    { id: "transport", label: "Transport", amount: inputs.transport, type: "expense", icon: TrendingDown },
    { id: "lifestyle", label: "Lifestyle", amount: inputs.lifestyle, type: "expense", icon: Heart },
    { id: "super", label: "Super", amount: inputs.super, type: "saving", icon: PiggyBank },
    { id: "investments", label: "Investments", amount: inputs.investments, type: "saving", icon: TrendingDown },
    { id: "savings", label: "Savings", amount: inputs.savings, type: "saving", icon: PiggyBank },
    { id: "property", label: "Property equity", amount: inputs.propertyEquity, type: "asset", icon: Building2 },
  ];

  const links: FlowLink[] = [
    { from: "salary", to: "income", amount: inputs.salary },
    { from: "locum", to: "income", amount: inputs.locum },
    { from: "income", to: "mortgage", amount: inputs.mortgage },
    { from: "income", to: "living", amount: inputs.living },
    { from: "income", to: "transport", amount: inputs.transport },
    { from: "income", to: "lifestyle", amount: inputs.lifestyle },
    { from: "income", to: "super", amount: inputs.super },
    { from: "income", to: "investments", amount: inputs.investments },
    { from: "income", to: "savings", amount: inputs.savings },
  ];

  const totalExpenses = expenses;
  const totalSavings = savings;
  const netWorth = inputs.propertyEquity + inputs.super + inputs.investments + inputs.savings;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;

  return { nodes, links, income, totalExpenses, totalSavings, netWorth, savingsRate };
}

const NODE_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  income: { bg: "bg-mint-soft", text: "text-mint", bar: "bg-mint" },
  expense: { bg: "bg-rose-50 dark:bg-rose-900/20", text: "text-rose-500", bar: "bg-rose-400" },
  saving: { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
  asset: { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" },
};

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

function NetWorthFlow() {
  const [salary, setSalary] = useState(15_000);
  const [locum, setLocum] = useState(2_000);
  const [mortgage, setMortgage] = useState(3_500);
  const [living, setLiving] = useState(1_500);
  const [transport, setTransport] = useState(500);
  const [lifestyle, setLifestyle] = useState(800);
  const [superContrib, setSuperContrib] = useState(2_500);
  const [investments, setInvestments] = useState(1_500);
  const [savings, setSavings] = useState(1_000);
  const [propertyEquity, setPropertyEquity] = useState(400_000);

  const flow = useMemo(
    () =>
      buildFlow({
        salary,
        locum,
        mortgage,
        living,
        transport,
        lifestyle,
        super: superContrib,
        investments,
        savings,
        propertyEquity,
      }),
    [salary, locum, mortgage, living, transport, lifestyle, superContrib, investments, savings, propertyEquity],
  );

  const incomeNodes = flow.nodes.filter((n) => ["salary", "locum"].includes(n.id));
  const expenseNodes = flow.nodes.filter((n) => ["mortgage", "living", "transport", "lifestyle"].includes(n.id));
  const savingNodes = flow.nodes.filter((n) => ["super", "investments", "savings"].includes(n.id));

  return (
    <section id="net-worth-flow" className="scroll-mt-20 border-t border-hairline">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal className="max-w-2xl">
          <div className="flex items-center gap-3">
            <span className="section-number">📊</span>
            <span className="eyebrow-bullet">Net Worth Flow</span>
          </div>
          <h2 className="mt-3 tracking-display text-3xl sm:text-4xl">
            See where every dollar <span className="text-gradient-mint">actually goes.</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            A flow diagram of your monthly cash: income in, expenses out,
            savings building, and your net worth composition.
          </p>
        </Reveal>

        {/* Quick stats */}
        <Reveal delay={50}>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="kpi-tile rounded-xl border border-hairline bg-card p-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Monthly income</p>
              <p className="mt-1 tracking-display text-lg tabular-nums">{formatAUD(flow.income)}</p>
            </div>
            <div className="kpi-tile rounded-xl border border-hairline bg-card p-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Expenses</p>
              <p className="mt-1 tracking-display text-lg tabular-nums text-rose-500">{formatAUD(flow.totalExpenses)}</p>
            </div>
            <div className="kpi-tile rounded-xl border border-hairline bg-card p-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Savings rate</p>
              <p
                className={`mt-1 tracking-display text-lg tabular-nums ${
                  flow.savingsRate >= 20 ? "text-emerald-500" : flow.savingsRate >= 10 ? "text-mint" : "text-amber-500"
                }`}
              >
                {flow.savingsRate.toFixed(0)}%
              </p>
            </div>
            <div className="kpi-tile rounded-xl border border-hairline bg-card p-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Net worth</p>
              <p className="mt-1 tracking-display text-lg tabular-nums text-gradient-mint">{formatAUD(flow.netWorth)}</p>
            </div>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_340px]">
          {/* Flow diagram */}
          <Reveal delay={100}>
            <Card className="border-hairline p-6">
              <h3 className="mb-4 tracking-display text-base">Monthly cash flow</h3>
              <div className="grid grid-cols-3 gap-4">
                {/* Income column */}
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-mint">Income sources</p>
                  {incomeNodes.map((node) => {
                    const Icon = node.icon;
                    const color = NODE_COLORS[node.type];
                    return (
                      <div key={node.id} className="rounded-lg border border-hairline bg-card p-3">
                        <div className="flex items-center gap-1.5">
                          <Icon className={`h-3 w-3 ${color.text}`} />
                          <span className="text-[11px] text-muted-foreground">{node.label}</span>
                        </div>
                        <p className="mt-1 text-xs font-medium tabular-nums">{formatAUD(node.amount)}</p>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className={`h-full ${color.bar} transition-all duration-700`}
                            style={{ width: `${(node.amount / flow.income) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Center hub */}
                <div className="flex flex-col items-center justify-center">
                  <div className="rounded-full border-2 border-mint/40 bg-mint-soft p-4 text-center w-full">
                    <p className="text-[10px] uppercase tracking-widest text-mint">Total income</p>
                    <p className="mt-1 tracking-display text-base tabular-nums">{formatAUD(flow.income)}</p>
                  </div>
                  <ArrowDown className="my-2 h-4 w-4 text-muted-foreground" />
                  <div className="grid w-full grid-cols-2 gap-2">
                    <div className="rounded-lg border border-rose-200 bg-rose-50/50 dark:bg-rose-900/10 p-2 text-center">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Out</p>
                      <p className="text-[11px] font-medium tabular-nums text-rose-500">{formatAUD(flow.totalExpenses)}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10 p-2 text-center">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Saved</p>
                      <p className="text-[11px] font-medium tabular-nums text-emerald-500">{formatAUD(flow.totalSavings)}</p>
                    </div>
                  </div>
                </div>

                {/* Outflows column */}
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-rose-500">Expenses</p>
                    <div className="mt-2 space-y-2">
                      {expenseNodes.map((node) => {
                        const Icon = node.icon;
                        const color = NODE_COLORS[node.type];
                        return (
                          <div key={node.id} className="rounded-lg border border-hairline bg-card p-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <Icon className={`h-2.5 w-2.5 ${color.text}`} />
                                <span className="text-[10px] text-muted-foreground">{node.label}</span>
                              </div>
                              <span className="text-[10px] font-medium tabular-nums">{formatAUD(node.amount)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-emerald-500">Savings</p>
                    <div className="mt-2 space-y-2">
                      {savingNodes.map((node) => {
                        const Icon = node.icon;
                        const color = NODE_COLORS[node.type];
                        return (
                          <div key={node.id} className="rounded-lg border border-hairline bg-card p-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <Icon className={`h-2.5 w-2.5 ${color.text}`} />
                                <span className="text-[10px] text-muted-foreground">{node.label}</span>
                              </div>
                              <span className="text-[10px] font-medium tabular-nums">{formatAUD(node.amount)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Net worth composition */}
              <div className="mt-6 border-t border-hairline pt-4">
                <p className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                  Net worth composition
                </p>
                <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="bg-amber-500 transition-all duration-700"
                    style={{ width: `${(propertyEquity / flow.netWorth) * 100}%` }}
                    title="Property"
                  />
                  <div
                    className="bg-mint transition-all duration-700"
                    style={{ width: `${((superContrib * 12 * 25) / flow.netWorth) * 100}%` }}
                    title="Super (projected)"
                  />
                  <div
                    className="bg-emerald-500 transition-all duration-700"
                    style={{ width: `${((investments * 12 * 10) / flow.netWorth) * 100}%` }}
                    title="Investments"
                  />
                  <div
                    className="bg-blue-500 transition-all duration-700"
                    style={{ width: `${((savings * 12 * 5) / flow.netWorth) * 100}%` }}
                    title="Savings"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> Property
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-mint" /> Super (proj.)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Investments
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-blue-500" /> Savings
                  </span>
                </div>
              </div>
            </Card>
          </Reveal>

          {/* Controls */}
          <Reveal delay={150}>
            <Card className="border-hairline p-5 space-y-4">
              <h3 className="tracking-display text-sm">Adjust your monthly cash</h3>

              <div className="space-y-2">
                <Label className="text-[11px] text-muted-foreground">
                  Salary — <span className="text-foreground font-medium">{formatAUD(salary)}</span>
                </Label>
                <Slider value={[salary]} onValueChange={([v]) => setSalary(v)} min={0} max={30_000} step={500} />
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] text-muted-foreground">
                  Locum — <span className="text-foreground font-medium">{formatAUD(locum)}</span>
                </Label>
                <Slider value={[locum]} onValueChange={([v]) => setLocum(v)} min={0} max={10_000} step={500} />
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] text-muted-foreground">
                  Mortgage — <span className="text-foreground font-medium">{formatAUD(mortgage)}</span>
                </Label>
                <Slider value={[mortgage]} onValueChange={([v]) => setMortgage(v)} min={0} max={8_000} step={250} />
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] text-muted-foreground">
                  Super contrib — <span className="text-foreground font-medium">{formatAUD(superContrib)}</span>
                </Label>
                <Slider value={[superContrib]} onValueChange={([v]) => setSuperContrib(v)} min={0} max={5_000} step={250} />
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] text-muted-foreground">
                  Investments — <span className="text-foreground font-medium">{formatAUD(investments)}</span>
                </Label>
                <Slider value={[investments]} onValueChange={([v]) => setInvestments(v)} min={0} max={5_000} step={250} />
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] text-muted-foreground">
                  Property equity — <span className="text-foreground font-medium">{formatAUD(propertyEquity)}</span>
                </Label>
                <Slider
                  value={[propertyEquity]}
                  onValueChange={([v]) => setPropertyEquity(v)}
                  min={0}
                  max={1_500_000}
                  step={50_000}
                />
              </div>

              <Disclaimer variant="inline" />
            </Card>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
