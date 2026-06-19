export async function listTemplates() {
  const r = await fetch("/api/v1/radar-templates", { credentials: "include" });
  if (!r.ok) return [];
  return r.json();
}
export async function upsertTemplate(data: unknown) {
  const r = await fetch("/api/v1/radar-templates", {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return r.json();
}
export async function listVersions(data: unknown) {
  const r = await fetch("/api/v1/radar-template-versions", {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return r.json();
}

export async function resetTemplate(data?: unknown): Promise<unknown> { return fetch('/api/v1/radar-templates/reset', { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data ?? {}) }).then(r => r.ok ? r.json() : null); }


export async function revertToVersion(data?: unknown): Promise<unknown> { return fetch("/api/v1/stub", { method: "POST", credentials: "include", headers: {"Content-Type":"application/json"}, body: JSON.stringify(data ?? {}) }).then(r => r.ok ? r.json() : null); }
