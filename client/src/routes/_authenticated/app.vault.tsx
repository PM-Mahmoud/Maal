import { createFileRoute } from "@tanstack/react-router";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listVault, uploadVaultFile, deleteVaultDoc, extractVaultDoc } from "@/lib/vault.functions";
import { saveProfile } from "@/lib/profile";

type ExtractField = { field: string; label: string; amount: number };
const audFmt = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

export const Route = createFileRoute("/_authenticated/app/vault")({ component: VaultPage });

type Doc = {
  id: string;
  filename: string;
  storage_path: string;
  size_bytes: number;
  created_at: string;
  collection: string;
  extracted: any;
};

const DEFAULT_COLLECTION = "My Documents";

function VaultPage() {
  const list = listVault;
  const rm = deleteVaultDoc;
  const extract = extractVaultDoc;

  const [docs, setDocs] = useState<Doc[]>([]);
  const [extraCollections, setExtraCollections] = useState<string[]>([]);
  const [target, setTarget] = useState<string>(DEFAULT_COLLECTION);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ [DEFAULT_COLLECTION]: true });
  const [extractResult, setExtractResult] = useState<{ id: string; fields: ExtractField[] } | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const collections = useMemo(() => {
    const set = new Set<string>([DEFAULT_COLLECTION, ...extraCollections, ...docs.map((d) => d.collection || DEFAULT_COLLECTION)]);
    return Array.from(set);
  }, [docs, extraCollections]);

  const grouped = useMemo(() => {
    const m: Record<string, Doc[]> = {};
    for (const c of collections) m[c] = [];
    for (const d of docs) {
      const c = d.collection || DEFAULT_COLLECTION;
      (m[c] ??= []).push(d);
    }
    return m;
  }, [docs, collections]);

  async function refresh() { setDocs((await list()) as Doc[]); }
  useEffect(() => { refresh(); }, []);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setErr(null); setBusy("upload");
    try {
      for (const file of arr) {
        if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} exceeds the 10MB limit`);
        await uploadVaultFile(file);
      }
      setExpanded((e) => ({ ...e, [target]: true }));
      await refresh();
    } catch (e: any) { setErr(e?.message ?? "Upload failed"); }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = ""; }
  }, [target]);

  async function runExtract(id: string) {
    setBusy(id); setErr(null); setExtractResult(null); setApplied(false);
    try {
      const res: any = await extract({ data: { id } });
      const fields: ExtractField[] = Array.isArray(res?.fields) ? res.fields : [];
      if (fields.length) setExtractResult({ id, fields });
      else setErr("Maal couldn't read any figures from this document. Try a digital PDF, Word, or CSV.");
      refresh();
    } catch (e: any) { setErr(e?.message ?? "Extraction failed"); }
    finally { setBusy(null); }
  }

  async function applyExtract() {
    if (!extractResult) return;
    setApplying(true); setErr(null);
    try {
      const patch: Record<string, number> = {};
      for (const f of extractResult.fields) patch[f.field] = f.amount;
      const saved = await saveProfile(patch);
      if (!saved) throw new Error("Could not apply figures to your profile.");
      setApplied(true);
      setExtractResult(null);
    } catch (e: any) { setErr(e?.message ?? "Could not apply figures."); }
    finally { setApplying(false); }
  }

  function newCollection() {
    const name = window.prompt("Collection name");
    if (!name) return;
    const n = name.trim().slice(0, 80);
    if (!n) return;
    setExtraCollections((c) => (c.includes(n) ? c : [...c, n]));
    setExpanded((e) => ({ ...e, [n]: true }));
    setTarget(n);
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-8">
      <h1 className="text-[24px] tracking-display font-bold mb-6">My Vault</h1>

      {applied && (
        <div className="mb-6 px-4 py-3 rounded-[10px] border border-[var(--mint)]/30 bg-[var(--mint)]/10 text-[13px]">
          Figures applied to your profile — your dashboard and Maal Score now reflect them.
        </div>
      )}

      {/* Extract → apply figures to profile (feeds the dashboard) */}
      {extractResult && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setExtractResult(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-[16px] border border-border bg-[var(--surface)] p-6">
            <h2 className="text-[16px] font-bold mb-1">Figures Maal read from this document</h2>
            <p className="text-[12px] text-muted-foreground mb-4">Apply them to your profile to update your dashboard and Maal Score. Nothing is saved until you confirm.</p>
            <ul className="divide-y divide-border mb-5">
              {extractResult.fields.map((f) => (
                <li key={f.field} className="flex items-center justify-between py-2.5 text-[13px]">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="font-semibold tabular-nums">{audFmt(f.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setExtractResult(null)} className="px-3 py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground">Not now</button>
              <button onClick={applyExtract} disabled={applying}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50">
                {applying ? "Applying…" : "Apply to my profile"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Left: collections */}
        <div className="space-y-3">
          {collections.map((name) => {
            const items = grouped[name] ?? [];
            const open = expanded[name] !== false;
            return (
              <section key={name} className="bg-[var(--surface)] border border-border rounded-[12px] overflow-hidden">
                <header className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <button onClick={() => setExpanded((e) => ({ ...e, [name]: !open }))}
                    className="flex items-center gap-2 text-[13px] font-semibold">
                    <span className="text-muted-foreground">{open ? "▾" : "▸"}</span>
                    {name}
                    <span className="text-[11px] text-muted-foreground font-normal">· {items.length}</span>
                  </button>
                  <button onClick={() => setTarget(name)}
                    className={`text-[11px] px-2 py-1 rounded-[6px] border ${target === name ? "border-[var(--mint)] text-[var(--mint)]" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    {target === name ? "Upload target" : "Set target"}
                  </button>
                </header>

                {open && (
                  <div className="p-6">
                    {items.length === 0 ? (
                      <div className="text-center py-10">
                        <p className="text-[12px] italic text-muted-foreground mb-4">This collection has no files</p>
                        <button
                          onClick={() => { setTarget(name); fileRef.current?.click(); }}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-[8px] text-[12px] font-semibold hover:opacity-90">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0-12l-4 4m4-4l4 4M5 21h14"/></svg>
                          UPLOAD FILES
                        </button>
                      </div>
                    ) : (
                      <ul className="divide-y divide-border">
                        {items.map((d) => (
                          <li key={d.id} className="py-3 flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium truncate">{d.filename}</p>
                              <p className="text-[11px] text-muted-foreground">{(d.size_bytes / 1024).toFixed(1)} KB · {new Date(d.created_at).toLocaleDateString()}</p>
                              {d.extracted && (
                                <p className="text-[11px] text-[var(--mint)] mt-1">{d.extracted.document_type ?? "Extracted"}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button onClick={() => runExtract(d.id)} disabled={busy === d.id}
                                className="px-2.5 py-1 border border-border rounded-[6px] text-[11px] font-semibold disabled:opacity-60">
                                {busy === d.id ? "Reading…" : d.extracted ? "Re-extract" : "Extract"}
                              </button>
                              <button onClick={async () => { await rm({ data: { id: d.id, storage_path: d.storage_path } }); refresh(); }}
                                className="text-[11px] text-muted-foreground hover:text-foreground">Delete</button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            );
          })}

          <button onClick={newCollection}
            className="w-full flex items-center justify-center gap-2 py-4 bg-[var(--surface)] border border-border rounded-[12px] text-[13px] font-semibold text-foreground hover:border-foreground transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
            New Collection
          </button>

          <p className="text-[11px] text-muted-foreground text-center pt-2">
            Maal does not provide financial advice. Information is for educational purposes only.
          </p>
        </div>

        {/* Right: uploader */}
        <aside className="space-y-4">
          <div className="bg-[var(--surface)] border border-border rounded-[12px] p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] font-semibold text-muted-foreground">Upload files to …</p>
              <select value={target} onChange={(e) => setTarget(e.target.value)}
                className="text-[12px] font-medium bg-background border border-border rounded-[6px] px-2 py-1">
                {collections.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <label
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files); }}
              className={`block border-2 border-dashed rounded-[10px] py-10 text-center cursor-pointer transition-colors ${dragOver ? "border-[var(--mint)] bg-[var(--mint)]/5" : "border-border hover:border-foreground"}`}>
              <input ref={fileRef} type="file" multiple className="hidden"
                onChange={(e) => e.target.files && uploadFiles(e.target.files)}
                accept=".pdf,.png,.jpg,.jpeg,.csv,.txt,.doc,.docx,.xls,.xlsx" />
              <svg className="mx-auto mb-2 text-muted-foreground" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0-12l-4 4m4-4l4 4M5 21h14"/></svg>
              <p className="text-[12px] font-semibold tracking-[0.12em] uppercase">
                {busy === "upload" ? "Uploading…" : "Drop files here"}
              </p>
            </label>

            <div className="flex items-start gap-2 mt-3 text-[11px] text-muted-foreground">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
              <p>Images, PDF, Word, CSV files. Max 10MB per file.</p>
            </div>
          </div>

          <div className="bg-[var(--surface)] border border-border rounded-[12px] p-4">
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              <p>
                Documents are private to your account and sent over an encrypted (HTTPS) connection.{" "}
                <a href="/security" className="text-[var(--mint)] underline">More on security</a>
              </p>
            </div>
          </div>

          {err && <p className="text-[12px] text-[var(--gold)]">{err}</p>}
        </aside>
      </div>
    </div>
  );
}