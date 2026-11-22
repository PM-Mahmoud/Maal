import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bookmark, MoreVertical, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { HomeCard } from "@/components/maal/home/HomeCard";
import type { SavedView } from "./api";

/** "Saved reports" card: the user's saved views, plus Save. */
export function SavedReportsCard({ views, loading, error, activeId, dirty, onOpen, onSave, onRename, onUpdate, onDelete, onRetry }: {
  views: SavedView[];
  loading: boolean;
  error: string | null;
  activeId: string | null;
  /** The active view's filters were changed since it was opened. */
  dirty: boolean;
  onOpen: (v: SavedView) => void;
  onSave: () => void;
  onRename: (v: SavedView) => void;
  onUpdate: (v: SavedView) => void;
  onDelete: (v: SavedView) => void;
  onRetry: () => void;
}) {
  // A menu action runs once the dropdown has closed, with the menu's focus
  // return cancelled — otherwise focus jumping back to the ⋮ trigger counts as
  // "focus outside" and instantly dismisses the dialog the action opens.
  const pending = useRef<(() => void) | null>(null);
  const runPending = (e: Event) => {
    const fn = pending.current;
    if (!fn) return;
    e.preventDefault();
    pending.current = null;
    fn();
  };
  return (
    <HomeCard label="Saved reports" labelId="rp-saved-label" className="rp-saved" bodyClassName="rp-saved-body">
      {loading ? (
        <div className="rp-saved-list"><div className="mh-skel" style={{ height: 64 }} /></div>
      ) : error ? (
        <div className="rp-saved-empty">
          <p className="m-0">{error}</p>
          <button type="button" className="mh-link-btn" onClick={onRetry}>Try again</button>
        </div>
      ) : views.length === 0 ? (
        <div className="rp-saved-empty">
          <span className="rp-saved-icon" aria-hidden><Bookmark /></span>
          <p className="m-0">Save a report’s filters here to get back to the ones you use most in one tap.</p>
        </div>
      ) : (
        <ul className="rp-saved-list" aria-label="Saved reports">
          {views.map((v) => {
            const active = v.id === activeId;
            return (
              <li key={v.id} className="rp-saved-item" data-active={active}>
                <button type="button" className="rp-saved-open" onClick={() => onOpen(v)} aria-current={active ? "true" : undefined}>
                  <span className="rp-saved-name">{v.name}</span>
                  {active && dirty && <span className="rp-saved-note">Edited — not yet saved</span>}
                </button>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button type="button" className="mh-dots" aria-label={`Options for ${v.name}`}><MoreVertical className="size-4" aria-hidden /></button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content align="end" sideOffset={6} className="mh mh-menu" onCloseAutoFocus={runPending}>
                      {active && dirty && (
                        <DropdownMenu.Item className="mh-menu-item" onSelect={() => { pending.current = () => onUpdate(v); }}><RefreshCw aria-hidden /> Update with current filters</DropdownMenu.Item>
                      )}
                      <DropdownMenu.Item className="mh-menu-item" onSelect={() => { pending.current = () => onRename(v); }}><Pencil aria-hidden /> Rename</DropdownMenu.Item>
                      <DropdownMenu.Item className="mh-menu-item rp-menu-danger" onSelect={() => { pending.current = () => onDelete(v); }}><Trash2 aria-hidden /> Delete</DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </li>
            );
          })}
        </ul>
      )}
      <div className="rp-saved-foot">
        <button type="button" className="mh-btn-outline mh-btn-wide" onClick={onSave} disabled={loading}>Save</button>
      </div>
    </HomeCard>
  );
}

/** Name dialog for saving (or renaming) a report. */
export function NameDialog({ open, title, intro, initialName, confirmLabel, busy, error, onSubmit, onClose }: {
  open: boolean;
  title: string;
  intro: string;
  initialName: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) setName(initialName); }, [open, initialName]);
  const trimmed = name.trim();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="rp-scrim" />
        <DialogPrimitive.Content className="mh-shell rp-modal" aria-describedby="rp-name-intro"
          onOpenAutoFocus={(e) => { e.preventDefault(); input.current?.focus(); input.current?.select(); }}>
          <div className="rp-modal-head">
            <DialogPrimitive.Title className="rp-eyebrow">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="rp-iconbtn" aria-label="Close" disabled={busy}><X aria-hidden /></DialogPrimitive.Close>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (trimmed && !busy) onSubmit(trimmed); }}>
            <div className="rp-modal-body">
              <p id="rp-name-intro" className="rp-modal-intro">{intro}</p>
              <label className="rp-float" data-filled={name.length > 0}>
                <span>Name</span>
                <input ref={input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-invalid={!!error} />
              </label>
              {error && <p className="rp-error" role="alert">{error}</p>}
            </div>
            <div className="rp-modal-foot">
              <button type="button" className="mh-btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className="mh-btn-ink" disabled={!trimmed || busy}>{busy ? "Saving…" : confirmLabel}</button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Confirm before deleting a saved report (it can't be undone). */
export function ConfirmDeleteDialog({ view, busy, onConfirm, onClose }: {
  view: SavedView | null;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <DialogPrimitive.Root open={!!view} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="rp-scrim" />
        <DialogPrimitive.Content className="mh-shell rp-modal" aria-describedby="rp-del-intro">
          <div className="rp-modal-head">
            <DialogPrimitive.Title className="rp-eyebrow">Delete report</DialogPrimitive.Title>
            <DialogPrimitive.Close className="rp-iconbtn" aria-label="Close" disabled={busy}><X aria-hidden /></DialogPrimitive.Close>
          </div>
          <div className="rp-modal-body">
            <p id="rp-del-intro" className="rp-modal-intro">Delete “{view?.name}”? Only the saved filters are removed — your transactions aren’t touched.</p>
          </div>
          <div className="rp-modal-foot">
            <button type="button" className="mh-btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="mh-btn-ink rp-btn-danger" onClick={onConfirm} disabled={busy}>{busy ? "Deleting…" : "Delete"}</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
