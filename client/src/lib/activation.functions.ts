// lib/activation.functions.ts — setup-completion + low-data signals for the
// dashboard activation pack. Reuses existing endpoints; no new backend.

import { fetchPortfolio } from "@/lib/portfolio";
import { fetchProfile } from "@/lib/profile";
import { listGoals } from "@/lib/goals.functions";
import { listVault } from "@/lib/vault.functions";

export type ActivationStep = {
  id: string;
  label: string;
  done: boolean;
  to: string; // where the step's CTA links
};

export type Activation = {
  steps: ActivationStep[];
  completed: number;
  total: number;
  pct: number;
  /** true when the user has almost no data — the advisor can't say much yet. */
  lowData: boolean;
};

export async function getActivation(): Promise<Activation> {
  const [portfolio, profile, goals, docs] = await Promise.all([
    fetchPortfolio(),
    fetchProfile(),
    listGoals(),
    listVault(),
  ]);
  if (!profile || portfolio.errors?.length) {
    throw new Error("Setup progress is temporarily unavailable");
  }

  const hasAsset = !!portfolio && (portfolio.investments + portfolio.superBalance + portfolio.cash + portfolio.property) > 0;
  const hasLiability = !!portfolio && (portfolio.propertyDebt + portfolio.otherDebt) > 0;
  const hasGoal = (goals?.length ?? 0) > 0;
  const hasDoc = (docs?.length ?? 0) > 0;
  const profileDone = !!profile && (profile.completed_onboarding || profile.annual_income > 0);

  const steps: ActivationStep[] = [
    { id: "profile", label: "Complete your profile", done: profileDone, to: "/app/onboarding" },
    { id: "asset", label: "Add your first asset", done: hasAsset, to: "/app/assets" },
    { id: "liability", label: "Add a liability", done: hasLiability, to: "/app/assets" },
    { id: "goal", label: "Set a financial goal", done: hasGoal, to: "/app/goals" },
    { id: "doc", label: "Upload a document to your Vault", done: hasDoc, to: "/app/vault" },
  ];

  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;
  return {
    steps,
    completed,
    total,
    pct: Math.round((completed / total) * 100),
    lowData: !hasAsset && !hasLiability,
  };
}
