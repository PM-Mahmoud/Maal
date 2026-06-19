
import { computeMaalScore, type ScoreInputs } from "@/lib/score";

export type ActionImpact = "high" | "medium" | "low";
export type ActionItem = {
  id: string;
  title: string;
  body: string;
  impact: ActionImpact;
  cta: { label: string; to: string };
};

const COPY: Record<string, Omit<ActionItem, "impact" | "id">> = {
  networth: {
    title: "Lift your savings rate",
    body: "Your wealth is below what we'd expect at your age and income. Automating a higher monthly transfer to investments is the fastest lever.",
    cta: { label: "Set a savings goal", to: "/app/goals" },
  },
  debt: {
    title: "Pay down expensive debt first",
    body: "Repaying high-interest debt usually beats investing. Target the smallest non-mortgage balance or the highest rate first.",
    cta: { label: "Review your debts", to: "/app/assets" },
  },
  super: {
    title: "Boost your super contributions",
    body: "You're tracking below the ATO concessional cap. Salary sacrificing more — even $100/fortnight — compounds meaningfully by retirement.",
    cta: { label: "Model your retirement", to: "/app/retirement" },
  },
  diversification: {
    title: "Diversify beyond super",
    body: "Most of your wealth sits inside super. A taxable ETF or property exposure adds flexibility before preservation age.",
    cta: { label: "Build a portfolio plan", to: "/app/portfolio-plan" },
  },
  buffer: {
    title: "Build a 6-month emergency buffer",
    body: "We can't see enough liquid cash to cover six months of essentials. Hold this in a high-interest savings account, not investments.",
    cta: { label: "Open an emergency goal", to: "/app/goals" },
  },
  baseline: {
    title: "Plan the next big purchase",
    body: "Your fundamentals look solid. Use a goal to ringfence cash for the next milestone — a home, sabbatical, or kids' education.",
    cta: { label: "Add a goal", to: "/app/goals" },
  },
  research: {
    title: "Pressure-test your strategy",
    body: "Ask the advisor to stress-test your plan against rate hikes, redundancy, or a market drawdown.",
    cta: { label: "Talk to the advisor", to: "/app/advisor" },
  },
};

function impactFromScore(s: number): ActionImpact {
  if (s < 45) return "high";
  if (s < 70) return "medium";
  return "low";
}

export async function getActionableSteps(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/actions', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
