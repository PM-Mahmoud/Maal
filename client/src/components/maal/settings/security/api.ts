// Data layer for Settings → Security (routes/account-security.js).
import { handleUnauthenticated } from "@/integrations/api";

export interface TwoFactorStatus {
  enabled: boolean;
  method: "email";
  email: string; // masked, e.g. "ma•••••@example.com"
  hasPassword: boolean;
  pending: "enable" | "disable" | null;
}

export class SecurityError extends Error {
  code: string | null;
  status: number;
  constructor(message: string, code: string | null, status: number) { super(message); this.code = code; this.status = status; }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/v1/security/2fa${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401) handleUnauthenticated();
  let j: Record<string, unknown> = {};
  try { j = await r.json(); } catch { /* non-JSON (e.g. proxy error) */ }
  if (!r.ok) {
    const msg = typeof j.error === "string" ? j.error : r.status === 429 ? "Too many attempts. Please wait a few minutes." : "Something went wrong. Please try again.";
    throw new SecurityError(msg, typeof j.code === "string" ? j.code : null, r.status);
  }
  return j as T;
}

export async function fetchTwoFactor(): Promise<TwoFactorStatus> {
  const s = await call<TwoFactorStatus>("");
  if (!s || typeof s.enabled !== "boolean") throw new SecurityError("Could not load your security settings.", null, 500);
  return s;
}
export const startTwoFactor = (purpose: "enable" | "disable") => call<{ ok: true; sentTo: string; expiresInSeconds: number }>("/start", { purpose });
export const confirmTwoFactor = (code: string) => call<{ ok: true; enabled: boolean }>("/confirm", { code });
export const disableTwoFactorWithPassword = (password: string) => call<{ ok: true; enabled: false }>("/disable", { password });
