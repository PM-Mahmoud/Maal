import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchProfile } from "@/lib/profile";
import { buildPlan, type PlanInput } from "@/lib/portfolio-plan";

export const Route = createFileRoute("/_authenticated/app/portfolio-plan")({ component: PortfolioPlanPage });

function PortfolioPlanPage() {
  const [input, setInput] = useState<PlanInput>({ age: 35, risk: "balanced" });

  useEffect(() => {
    (async () => {
      const prof = await fetchProfile();
      const age = prof?.age ?? 35;
      const risk = ((prof?.risk as PlanInput["risk"]) ?? "balanced");
      setInput({ age, risk });
    })();
  }, []);

  const plan = buildPlan(input);

  return (
    <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">Portfolio Plan</p>
      <h1 className="text-[32px] tracking-display font-bold mb-8">A starting allocation.</h1>

      <div className="grid md:grid-cols-2 gap-3 mb-8">
        <label className="p-4 border border-border rounded-[12px] bg-[var(--surface)]">
          <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Age</span>
          <input type="number" value={input.age} onChange={(e) => setInput({ ...input, age: Number(e.target.value) })}
            className="w-full bg-transparent text-[22px] font-bold tracking-display mt-1 focus:outline-none" />
        </label>
        <label className="p-4 border border-border rounded-[12px] bg-[var(--surface)]">
          <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Risk</span>
          <select value={input.risk} onChange={(e) => setInput({ ...input, risk: e.target.value as any })}
            className="w-full bg-transparent text-[18px] font-semibold mt-1 focus:outline-none">
            <option value="conservative">Conservative</option>
            <option value="balanced">Balanced</option>
            <option value="growth">Growth</option>
            <option value="high-growth">High Growth</option>
          </select>
        </label>
      </div>

      <div className="border border-border rounded-[12px] bg-[var(--surface)] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground bg-[var(--secondary)]">
              <th className="px-4 py-3">Asset class</th>
              <th className="px-4 py-3">Allocation</th>
              <th className="px-4 py-3">Suggested ETF</th>
              <th className="px-4 py-3">Ticker</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((a) => (
              <tr key={a.class} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{a.class}</td>
                <td className="px-4 py-3 tabular-nums">{a.pct}%</td>
                <td className="px-4 py-3">{a.etf}</td>
                <td className="px-4 py-3 font-mono text-[12px]">{a.ticker}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground mt-4">Educational allocation framework only. This is not personal financial advice.</p>
    </div>
  );
}