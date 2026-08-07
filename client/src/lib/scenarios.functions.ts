export type SavedScenario = {
  id: string;
  name: string;
  created_at: string;
  model_version: string;
  result: {
    comparison: { net_worth_difference: number };
    scenario: { ending_net_worth: number };
    assumptions: { years: number; annual_return_rate: number; extra_annual_contribution: number };
  };
};

async function scenarioRequest(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "include", ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Could not save scenario");
  }
  return response.json();
}

export function listScenarios(): Promise<SavedScenario[]> {
  return scenarioRequest("/api/v1/scenarios");
}

export function saveScenario(input: { name: string; assumptions: Record<string, number> }): Promise<SavedScenario> {
  return scenarioRequest("/api/v1/scenarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
