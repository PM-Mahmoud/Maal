import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { deleteTag, listTags, type Tag } from "./api";
import { CreateTagDialog } from "./pickers";
import { ErrorNote, TagDot } from "./ui";
import "@/components/maal/home/home.css";
import "./transaction-detail.css";

export function ManageTagsDialog({ onClose, onChanged }: {
  onClose: () => void;
  onChanged?: (tags: Tag[]) => void;
}) {
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Tag | "new" | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try { setTags(await listTags()); }
    catch (error) { setError((error as Error).message); }
  }
  useEffect(() => { void load(); }, []);

  function saveList(next: Tag[]) {
    const sorted = next.sort((a, b) => a.name.localeCompare(b.name));
    setTags(sorted);
    onChanged?.(sorted);
  }

  async function remove(tag: Tag) {
    if (!tags) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTag(tag.id);
      saveList(tags.filter((item) => item.id !== tag.id));
      setDeleting(null);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="td-scrim td-scrim-top" />
        <DialogPrimitive.Content className="mh-shell td-modal td-manage-tags" aria-describedby={undefined}>
          <header className="td-head td-head-modal">
            <DialogPrimitive.Title className="td-eyebrow">{deleting ? "Delete tag" : "Manage tags"}</DialogPrimitive.Title>
            <span className="td-head-right">
              <DialogPrimitive.Close className="td-iconbtn" disabled={busy} aria-label="Close manage tags"><X aria-hidden /></DialogPrimitive.Close>
            </span>
          </header>
          <div className="td-modal-body">
            <ErrorNote message={error} onDismiss={tags ? () => setError(null) : undefined} />
            {deleting ? (
              <>
                <p className="td-tag-manager-label m-0">
                  Delete “{deleting.name}”? This tag is used on {deleting.uses ?? 0} {(deleting.uses ?? 0) === 1 ? "transaction" : "transactions"}.
                </p>
                <div className="td-actions">
                  <button type="button" className="td-btn-sm" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button>
                  <button type="button" className="td-btn-sm td-btn-ink" disabled={busy} onClick={() => void remove(deleting)}>
                    {busy ? "Deleting…" : "Delete tag"}
                  </button>
                </div>
              </>
            ) : tags === null ? (
              error ? <button type="button" className="td-btn-sm" onClick={() => void load()}>Try again</button>
                : <p className="td-muted m-0" role="status">Loading tags…</p>
            ) : (
              <>
                {tags.length ? (
                  <ul className="td-card td-tag-manager-list" aria-label="Your tags">
                    {tags.map((tag) => (
                      <li className="td-row td-row-static" key={tag.id}>
                        <span className="td-tag-manager-label"><TagDot color={tag.color} />{tag.name}</span>
                        <span className="td-actions">
                          <button type="button" className="td-btn-sm" aria-label={`Edit ${tag.name}`} onClick={() => setEditing(tag)}>Edit</button>
                          <button type="button" className="td-btn-sm" aria-label={`Delete ${tag.name}`} onClick={() => { setError(null); setDeleting(tag); }}>Delete</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="td-muted m-0">No tags yet.</p>}
                <div className="td-actions">
                  <button type="button" className="td-btn-sm td-btn-ink" onClick={() => setEditing("new")}>Create tag</button>
                </div>
              </>
            )}
          </div>
          {editing && tags && (
            <CreateTagDialog open tag={editing === "new" ? undefined : editing} existing={tags}
              onClose={() => setEditing(null)}
              onCreated={(tag) => {
                saveList([...tags.filter((item) => item.id !== tag.id), tag]);
                setEditing(null);
              }} />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
