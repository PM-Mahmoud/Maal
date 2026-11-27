export type HomeBudgetSummary = {
  budget: number;
  spent: number;
  overBudget: Array<{ group: string; over: number }>;
};

export function homeBudgetSummary(input: {
  transactions: unknown[];
  budgets: Array<{ category_group: string | null; monthly_amount: number }>;
  total: number;
  excluded?: string[];
  today?: Date;
}): HomeBudgetSummary | null;
