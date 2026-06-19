
import { z } from "zod";

const SYS = `You are Maal Research, generating concise educational research notes for Australian investors.
Output STRICT JSON only (no markdown fences), with shape:
{ "title": string, "summary": string, "sections": [{"heading": string, "body": string}], "key_facts": string[], "risks": string[], "ethical_notes": string }
Rules: AUD context, no "halal" word (use "Ethical / Ethical (Islamic)"). Educational only.
End summary with: "This is general information only — not personal financial advice."`;

async function callJson(prompt: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (res.status === 429) throw new Error("Rate limit reached. Try again shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted.");
  if (!res.ok) throw new Error("Research is temporarily unavailable.");
  const j = await res.json();
  const text = j?.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(text); } catch { return { title: "Research", summary: text, sections: [], key_facts: [], risks: [], ethical_notes: "" }; }
}

export async function generateResearch(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/research', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function listResearch(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/research', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
export async function deleteResearch(data?: unknown): Promise<unknown> {
  const r = await fetch('/api/v1/research', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
  if (!r.ok) return null;
  return r.json();
}
