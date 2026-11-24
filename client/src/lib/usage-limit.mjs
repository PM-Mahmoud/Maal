export class UsageLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageLimitError";
  }
}

export function usageLimitError(status, payload) {
  if (status !== 402 || payload?.code !== "usage_limit") return null;
  const explanation = typeof payload.error === "string" ? payload.error.trim() : "";
  return new UsageLimitError(explanation || "You’ve reached your plan’s usage limit.");
}
