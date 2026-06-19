
import { computeMaalScore } from "@/lib/score";
import { projectRetirement, ASFA_SINGLE_TARGET, RETIREMENT_AGE } from "@/lib/retirement";

const SYSTEM = `You are Maal, a CFO-level advisor for Australians. Generate exactly 5 prioritized action items as a JSON array of strings. Each item is one short sentence (max 22 words). No preamble, no markdown, no numbering — just a JSON array. End the last item with "— general information only, not personal financial advice."`;

async function generateActionPlan(snapshot: unknown): Promise<string[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return ["Add LOVABLE_API_KEY to enable AI action plan."];
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Snapshot (AUD): ${JSON.stringify(snapshot)}` },
        ],
      }),
    });
    if (!res.ok) return ["Action plan temporarily unavailable."];
    const json = await res.json();
    const raw: string = json?.choices?.[0]?.message?.content ?? "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    const arr = match ? JSON.parse(match[0]) : [];
    return Array.isArray(arr) ? arr.slice(0, 6).map((x) => String(x)) : [];
  } catch (e) {
    console.warn("plan gen failed", e);
    return ["Action plan temporarily unavailable."];
  }
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}

// Sanitize text for Helvetica (WinAnsi). Replace smart quotes/em dashes with ASCII.
function safe(s: string) {
  return s
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x00-\x7F]/g, "");
}

export async function generateReport(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/report', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
