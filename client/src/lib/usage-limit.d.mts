export class UsageLimitError extends Error {}
export function usageLimitError(status: number, payload: unknown): UsageLimitError | null;
