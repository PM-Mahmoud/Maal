import { createFileRoute } from "@tanstack/react-router";

import { useEffect, useMemo, useState } from "react";
import { fetchPortfolio, type Portfolio } from "@/lib/portfolio";
import { projectRetirement, ASFA_SINGLE_TARGET, ASFA_COUPLE_TARGET, RETIREMENT_AGE } from "@/lib/retirement";
import { formatAUD } from "@/lib/score";
import { Disclaimer } from "@/components/maal/Disclaimer";
import { listScenarios, saveScenario, deleteScenario } from "@/lib/retirement.functions";

export const Route = createFileRoute("/_authenticated/app/retirement")({
  component: RetirementPage,
});

function RetirementPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [contrib, setContrib] = useState(11.5);
  const [ret, setRet] = useState(7);
  const [household, setHousehold] = useState<"single" | "couple">("single");
  const list = listScenarios;
  const save = saveScenario;
  const del = deleteScenario;
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [scenarioName, setScenarioName] = useState("");

  useEffect(() => {
    fetchPortfolio().then(setPortfolio);
    list().then((rows) => setScenarios(rows as any[]));
  }, [list]);

  const projection = useMemo(() => {
    if (!portfolio) return null;
    return projectRetirement({
      age: portfolio.age,
      superBalance: portfolio.superBalance,
      annualIncome: portfolio.income,
      contributionRatePct: contrib,
      expectedReturnPct: ret,
      target: household === "single" ? ASFA_SINGLE_TARGET : ASFA_COUPLE_TARGET,
      iterations: 400,
    });
  }, [portfolio, contrib, ret, household]);

  if (!portfolio || !projection) {
    return <div className="p-10 text-muted-foreground text-sm">Loading projection…</div>;
  }

  const yearsToRetire = RETIREMENT_AGE - portfolio.age;
  const prob = Math.round(projection.probOfHittingTarget * 100);
  const shortfall = projection.shortfallReal;
  const onTrack = shortfall >= 0;

  async function onSave() {
    const name = scenarioName.trim() || `${household} · ${contrib}% contrib · ${ret}% return`;
    const inputs = {
      age: portfolio!.age,
      superBalance: portfolio!.superBalance,
      annualIncome: portfolio!.income,
      contributionRatePct: contrib,
      expectedReturnPct: ret,
      target: projection!.targetReal,
      household,
    };
    const result = {
      probOfHittingTarget: projection!.probOfHittingTarget,
      shortfallReal: projection!.shortfallReal,
      finalMedian: projection!.median[projection!.median.length - 1],
    };
    const row = await save({ data: { name, inputs, result } });
    setScenarios((s) => [row as any, ...s]);
    setScenarioName("");
  }

  function loadScenario(s: any) {
    setContrib(s.inputs.contributionRatePct);
    setRet(s.inputs.expectedReturnPct);
    setHousehold(s.inputs.household);
  }

  async function removeScenario(id: string) {
    await del({ data: { id } });
    setScenarios((s) => s.filter((x) => x.id !== id));
  }

  // Chart geometry
  const W = 720, H = 240, pad = 32;
  const all = [...projection.p90, projection.targetReal];
  const maxY = Math.max(...all) * 1.05;
  const xs = (i: number) => pad + (i / (projection.years.length - 1)) * (W - pad * 2);
  const ys = (v: number) => H - pad - (v / maxY) * (H - pad * 2);
  const band = projection.years
    .map((_, i) => `${i === 0 ? "M" : "L"}${xs(i)},${ys(projection.p90[i])}`)
    .concat(projection.years.map((_, i) => `L${xs(projection.years.length - 1 - i)},${ys(projection.p10[projection.years.length - 1 - i])}`))
    .join(" ") + " Z";
  const medianPath = projection.median.map((v, i) => `${i === 0 ? "M" : "L"}${xs(i)},${ys(v)}`).join(" ");
  const targetY = ys(projection.targetReal);

  return (
    <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">Retirement</p>
      <h1 className="text-[32px] tracking-display font-bold leading-tight mb-1">Will your super get you there?</h1>
      <p className="text-[13px] text-muted-foreground mb-8">
        Monte Carlo projection of your super balance to age {RETIREMENT_AGE}, compared with the ASFA Comfortable target.
      </p>

      <div className="grid md:grid-cols-3 gap-3 mb-6">
        <Stat label="Years to retirement" value={`${yearsToRetire}`} />
        <Stat label={`ASFA ${household} target`} value={formatAUD(projection.targetReal)} tone="gold" />
        <Stat label="Probability of hitting target" value={`${prob}%`} tone={prob >= 70 ? "mint" : prob >= 40 ? "default" : "gold"} />
      </div>

      <div className="p-6 border border-border rounded-[12px] bg-[var(--surface)] mb-6">
        <div className="flex items-baseline justify-between mb-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Balance trajectory (nominal AUD)</p>
          <p className={`text-[12px] font-semibold ${onTrack ? "text-[var(--mint)]" : "text-[var(--gold)]"}`}>
            {onTrack ? `On track — surplus ${formatAUD(shortfall)} (today's $)` : `Shortfall ${formatAUD(Math.abs(shortfall))} (today's $)`}
          </p>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
          <path d={band} fill="hsl(var(--foreground))" opacity={0.08} />
          <path d={medianPath} stroke="hsl(var(--foreground))" strokeWidth={2} fill="none" />
          <line x1={pad} x2={W - pad} y1={targetY} y2={targetY} stroke="var(--gold)" strokeDasharray="4 4" />
          <text x={W - pad} y={targetY - 6} textAnchor="end" fontSize="10" fill="var(--gold)" fontWeight="700">ASFA target</text>
          <text x={pad} y={H - 8} fontSize="10" fill="hsl(var(--muted-foreground))">Age {portfolio.age}</text>
          <text x={W - pad} y={H - 8} textAnchor="end" fontSize="10" fill="hsl(var(--muted-foreground))">Age {RETIREMENT_AGE}</text>
        </svg>
      </div>

      <div className="grid md:grid-cols-3 gap-4 p-6 border border-border rounded-[12px] bg-[var(--surface)]">
        <Slider label="Total contribution %" value={contrib} min={9.5} max={25} step={0.5} onChange={setContrib} suffix="%" />
        <Slider label="Expected return" value={ret} min={3} max={10} step={0.25} onChange={setRet} suffix="%" />
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-2">Household</p>
          <div className="flex gap-2">
            {(["single", "couple"] as const).map((h) => (
              <button
                key={h}
                onClick={() => setHousehold(h)}
                className={`flex-1 px-3 py-2 rounded-[8px] text-[12px] font-semibold border ${
                  household === h ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {h.charAt(0).toUpperCase() + h.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 p-6 border border-border rounded-[12px] bg-[var(--surface)]">
        <div className="flex items-end justify-between mb-4 gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Saved scenarios</p>
            <p className="text-[12px] text-muted-foreground mt-1">Snapshot the current sliders to compare strategies later.</p>
          </div>
          <div className="flex gap-2">
            <input
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="Name (optional)"
              className="bg-transparent border border-border rounded-[8px] px-3 py-2 text-[12px] w-56"
            />
            <button onClick={onSave} className="bg-foreground text-background px-4 py-2 rounded-[8px] text-[12px] font-semibold">
              Save scenario
            </button>
          </div>
        </div>
        {scenarios.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No saved scenarios yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {scenarios.map((s) => (
              <li key={s.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {s.inputs.contributionRatePct}% contrib · {s.inputs.expectedReturnPct}% return ·{" "}
                    {Math.round(s.result.probOfHittingTarget * 100)}% chance ·{" "}
                    {s.result.shortfallReal >= 0 ? "surplus" : "shortfall"} {formatAUD(Math.abs(s.result.shortfallReal))}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => loadScenario(s)} className="text-[11px] font-semibold text-foreground underline underline-offset-4">Load</button>
                  <button onClick={() => removeScenario(s.id)} className="text-[11px] text-muted-foreground hover:text-foreground">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-10">
        <Disclaimer variant="inline" />
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "mint" | "gold" }) {
  const color = tone === "mint" ? "text-[var(--mint)]" : tone === "gold" ? "text-[var(--gold)]" : "text-foreground";
  return (
    <div className="p-5 border border-border rounded-[12px] bg-[var(--surface)]">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={`mt-2 text-[22px] font-bold tracking-display ${color}`}>{value}</p>
    </div>
  );
}

function Slider({
  label, value, min, max, step, onChange, suffix,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; suffix?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className="text-[12px] tabular-nums font-semibold">{value}{suffix}</p>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--mint)]"
      />
    </div>
  );
}