// lib/widgets.functions.ts — dashboard widgets saved from Ask Maal.

export type WidgetSpec = {
  id?: number;
  source: string;
  type: "donut" | "line" | "table" | "stat-cards";
  title: string;
  data: any;
};

export async function listWidgets(): Promise<WidgetSpec[]> {
  try {
    const r = await fetch("/api/v1/widgets", { credentials: "include" });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j?.widgets) ? j.widgets : [];
  } catch {
    return [];
  }
}

export async function addWidget(source: string, title?: string): Promise<boolean> {
  const r = await fetch("/api/v1/widgets", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, title }),
  });
  return r.ok;
}

export async function removeWidget(id: number): Promise<void> {
  await fetch(`/api/v1/widgets/${id}`, { method: "DELETE", credentials: "include" });
}
