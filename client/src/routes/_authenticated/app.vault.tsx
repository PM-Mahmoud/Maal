import { createFileRoute } from "@tanstack/react-router";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/api";
import { listVault, registerVaultDoc, deleteVaultDoc, extractVaultDoc } from "@/lib/vault.functions";

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
  const register = registerVaultDoc;
  const rm = deleteVaultDoc;
  const extract = extractVaultDoc;

  const [docs, setDocs] = useState<Doc[]>([]);
  const [extraCollections, setExtraCollections] = useState<string[]>([]);
  const [target, setTarget] = useState<string>(DEFAULT_COLLECTION);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ [DEFAULT_COLLECTION]: true });
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
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id; if (!uid) throw new Error("Not signed in");
      for (const file of arr) {
        if (file.size > 5 * 1024 * 1024 * 1024) throw new Error(`${file.name} exceeds 5GB`);
        const path = `${uid}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
        const up = await supabase.storage.from("vault").upload(path, file, { upsert: false });
        if (up.error) throw up.error;
        await register({ data: { filename: file.name, storage_path: path, size_bytes: file.size, collection: target } } as any);
      }
      setExpanded((e) => ({ ...e, [target]: true }));
      await refresh();
    } catch (e: any) { setErr(e?.message ?? "Upload failed"); }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = ""; }
  }, [register, target]);

  async function runExtract(id: string) {
    setBusy(id); setErr(null);
    try { await extract({ data: { id } }); refresh(); }
    catch (e: any) { setErr(e?.message ?? "Extraction failed"); }
    finally { setBusy(null); }
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
              <p>Images, PDF, Word, CSV files. Max 5gb per file.</p>
            </div>
          </div>

          <div className="bg-[var(--surface)] border border-border rounded-[12px] p-4">
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              <p>
                All documents are encrypted at rest and in transit.{" "}
                <a href="#" className="text-[var(--mint)] underline">More on security</a>
              </p>
            </div>
          </div>

          {err && <p className="text-[12px] text-[var(--gold)]">{err}</p>}
        </aside>
      </div>
    </div>
  );
}