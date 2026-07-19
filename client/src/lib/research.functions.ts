// lib/research.functions.ts
// Real research over /api/v1/research. Callers pass a Lovable-style
// { data: {...} } envelope, so unwrap it here before hitting the API.

export async function listResearch(): Promise<unknown[]> {
  const r = await fetch('/api/v1/research', { credentials: 'include' });
  if (!r.ok) {
    let msg = 'Could not load research history';
    try { const j = await r.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

// Start an async deep-research job. Returns { jobId, status, phase }.
export async function startResearch(payload?: { data?: { topic?: string } }): Promise<{ jobId: string; status: string; phase: string }> {
  const topic = payload?.data?.topic ?? '';
  const r = await fetch('/api/v1/research/generate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic }),
  });
  if (!r.ok) {
    let msg = 'Research failed';
    try { const j = await r.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return r.json();
}

// Poll a running job. Returns { status, phase, elapsedMs, report? }. Accepts an
// optional AbortSignal so unmount cleanup can cancel an in-flight status request.
export async function pollResearch(jobId: string, signal?: AbortSignal): Promise<{ status: string; phase: string; elapsedMs: number; error?: string | null; report?: unknown }> {
  const r = await fetch(`/api/v1/research/${jobId}`, { credentials: 'include', signal });
  if (!r.ok) throw new Error('Could not check research status');
  return r.json();
}

// Fetch a finished report's branded PDF and trigger a browser download.
export async function downloadResearchPdf(reportId: string): Promise<void> {
  const r = await fetch(`/api/v1/research/${reportId}/pdf`, { credentials: 'include' });
  if (!r.ok) throw new Error('Could not generate the PDF');
  const { filename, base64 } = await r.json();
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'maal-research.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function deleteResearch(payload?: { data?: { id?: string } }): Promise<void> {
  const id = payload?.data?.id;
  if (!id) throw new Error('Missing report id');
  const r = await fetch(`/api/v1/research/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!r.ok) {
    let msg = 'Could not delete the report';
    try { const j = await r.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
}
