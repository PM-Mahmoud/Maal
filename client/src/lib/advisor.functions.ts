
import { z } from "zod";

const SYSTEM_PROMPT = `You are Maal, a CFO-level financial advisor for Australians. You are NOT a licensed financial adviser; you provide educational information only.

Tone: calm, precise, no jargon. Speak like a senior CFO who respects the user's time. Use AUD ($) and Australian context (ASFA, super, SG rate, ATO).

Rules:
- Never call yourself "AI" prominently. You are an advisor.
- Never use the word "halal". Use "Ethical" or "Ethical (Islamic)".
- Always end material recommendations with: "This is general information only — not personal financial advice."
- Keep answers under 180 words unless the user asks for depth.
- When relevant, reference the user's Maal Score pillars: Net Worth, Debt Health, Super Adequacy, Diversification, Emergency Buffer.`;

async function buildPortfolioContext(supabase: any, userId: string) {
  const [inc, sup, inv, prop, cash, debts, prof] = await Promise.all([
      supabase.from("incomes").select("annual_amount"),
      supabase.from("super_accounts").select("balance"),
      supabase.from("investments").select("value"),
      supabase.from("properties").select("value, mortgage_balance"),
      supabase.from("cash_accounts").select("balance"),
      supabase.from("debts").select("balance"),
      supabase.from("profiles").select("age_band, display_name").eq("id", userId).maybeSingle(),
    ]);
    const sum = (rows: any[] | null, k: string) => (rows ?? []).reduce((a, r) => a + Number(r[k] ?? 0), 0);
  return {
      name: prof.data?.display_name ?? "there",
      ageBand: prof.data?.age_band ?? "unknown",
      income: sum(inc.data, "annual_amount"),
      super: sum(sup.data, "balance"),
      investments: sum(inv.data, "value"),
      property: sum(prop.data, "value"),
      propertyDebt: sum(prop.data, "mortgage_balance"),
      cash: sum(cash.data, "balance"),
      otherDebt: sum(debts.data, "balance"),
    };
}

async function callAdvisor(messages: { role: string; content: string }[], snapshot: unknown) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: `User financial snapshot (AUD): ${JSON.stringify(snapshot)}` },
        ...messages,
      ],
    }),
  });
  if (res.status === 429) throw new Error("Rate limit reached. Please try again in a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted. Please add credits to continue.");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("AI gateway error", res.status, text);
    throw new Error("Advisor is temporarily unavailable.");
  }
  const json = await res.json();
  return (json?.choices?.[0]?.message?.content ?? "I'm not sure how to answer that yet.") as string;
}

// --- Thread CRUD ----------------------------------------------------------

export async function listThreads(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/advisor', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function createThread(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/advisor', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function deleteThread(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/advisor', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function getThreadMessages(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/advisor', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function sendAdvisorMessage(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/advisor', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
