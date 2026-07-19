import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { fetchProfile } from "@/lib/profile";
import { buildPlan, type PlanInput } from "@/lib/portfolio-plan";

export const Route = createFileRoute("/_authenticated/app/portfolio-plan")({ component: PortfolioPlanPage });

const DEFAULT_INPUT: PlanInput = { age: 35, risk: "balanced" };

// The onboarding wizard persists risk as "conservative" | "balanced" | "growth" |
// "high_growth" (see app.onboarding.tsx), while PlanInput uses the hyphenated
// "high-growth". Only an explicit known value maps through — anything unknown or
// invalid normalizes to "balanced", so a bad stored value can never fall through
// to buildPlan's else branch (the riskiest high-growth allocation).
function normalizeRisk(v: unknown): PlanInput["risk"] {
  if (v === "conservative" || v === "balanced" || v === "growth" || v === "high-growth") return v;
  if (v === "high_growth") return "high-growth";
  return "balanced";
}

// /api/v1/profile returns a server-derived numeric age (from age_band). Guard
// against missing/implausible values before feeding the glide path.
function normalizeAge(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 120 ? Math.round(n) : DEFAULT_INPUT.age;
}

function PortfolioPlanPage() {
  const [input, setInput] = useState<PlanInput>(DEFAULT_INPUT);
  // Set once the user touches age/risk — a late-resolving profile load must not
  // clobber their edits.
  const dirty = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const prof = await fetchProfile();
        // Apply the profile only while the inputs are still pristine; on any
        // failure (or a missing profile) keep the default state.
        if (!prof || dirty.current) return;
        setInput({ age: normalizeAge(prof.age), risk: normalizeRisk(prof.risk) });
      } catch {
        /* profile load failed — defaults already in place */
      }
    })();
  }, []);

  const plan = buildPlan({
    age: Number.isFinite(input.age) ? input.age : DEFAULT_INPUT.age,
    risk: normalizeRisk(input.risk),
  });

  return (
    <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">Portfolio Plan</p>
      <h1 className="text-[32px] tracking-display font-bold mb-8">A starting allocation.</h1>

      <div className="grid md:grid-cols-2 gap-3 mb-8">
        <label className="p-4 border border-border rounded-[12px] bg-[var(--surface)]">
          <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Age</span>
          <input type="number" value={input.age} onChange={(e) => { dirty.current = true; setInput({ ...input, age: Number(e.target.value) }); }}
            className="w-full bg-transparent text-[22px] font-bold tracking-display mt-1 focus:outline-none" />
        </label>
        <label className="p-4 border border-border rounded-[12px] bg-[var(--surface)]">
          <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Risk</span>
          <select value={input.risk} onChange={(e) => { dirty.current = true; setInput({ ...input, risk: normalizeRisk(e.target.value) }); }}
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
      <p className="text-[11px] text-muted-foreground mt-4">Maal does not provide financial advice. Any information provided by Maal is for educational purposes only. You should do your own research. Investing is risky and you can lose all of your money.</p>
    </div>
  );
}