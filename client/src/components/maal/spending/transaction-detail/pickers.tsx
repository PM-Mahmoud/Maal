import { useId, useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import { iconForGroup } from "../overview/categoryIcons";
import { createTag, type CategoryGroup, type Tag } from "./api";
import { ErrorNote, TAG_COLOR_KEYS, TAG_SWATCHES, TagDot } from "./ui";

export type CategoryValue = { group: string; category: string | null };

function SearchField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="td-search">
      <Search aria-hidden />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search" aria-label={label} />
    </label>
  );
}

/**
 * Searchable category list: one radio per group of the AU taxonomy, with the
 * chosen group's sub-categories shown underneath (optional).
 */
export function CategoryList({ groups, value, onChange }: {
  groups: CategoryGroup[]; value: CategoryValue | null; onChange: (v: CategoryValue) => void;
}) {
  const [q, setQ] = useState("");
  const name = useId();
  const query = q.trim().toLowerCase();
  const shown = useMemo(() => !query ? groups : groups.filter((g) =>
    g.group.toLowerCase().includes(query) || g.categories.some((c) => c.toLowerCase().includes(query))), [groups, query]);

  return (
    <div className="td-picker">
      <SearchField value={q} onChange={setQ} label="Search categories" />
      {shown.length === 0 ? (
        <p className="td-muted td-pad m-0">No categories match “{q}”.</p>
      ) : (
        <ul className="td-picklist" role="radiogroup" aria-label="Category">
          {shown.map((g) => {
            const Icon = iconForGroup(g.group);
            const on = value?.group === g.group;
            const subs = query ? g.categories.filter((c) => c.toLowerCase().includes(query) || g.group.toLowerCase().includes(query)) : g.categories;
            return (
              <li key={g.group}>
                <label className="td-pick" data-on={on}>
                  <span className="td-cat-icon" aria-hidden><Icon /></span>
                  <span className="td-pick-label">{g.group}</span>
                  <input type="radio" name={name} className="td-radio" checked={on && !value?.category}
                    onChange={() => onChange({ group: g.group, category: null })} />
                </label>
                {(on || (query && subs.length > 0 && !g.group.toLowerCase().includes(query))) && subs.length > 0 && (
                  <ul className="td-sublist">
                    {subs.map((c) => (
                      <li key={c}>
                        <label className="td-pick td-pick-sub" data-on={on && value?.category === c}>
                          <span className="td-pick-label">{c}</span>
                          <input type="radio" name={name} className="td-radio" checked={on && value?.category === c}
                            onChange={() => onChange({ group: g.group, category: c })} />
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Searchable checklist of the user's tags with a Create button. */
export function TagList({ tags, selected, onToggle, onCreate, emptyHint }: {
  tags: Tag[]; selected: string[]; onToggle: (id: string) => void; onCreate: () => void; emptyHint?: string;
}) {
  const [q, setQ] = useState("");
  const shown = tags.filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="td-picker">
      <SearchField value={q} onChange={setQ} label="Search tags" />
      {shown.length === 0 ? (
        <div className="td-empty-box">
          <p className="m-0">{tags.length === 0 ? (emptyHint || "No tags yet.") : `No tags match “${q}”.`}</p>
          <button type="button" className="td-btn-sm" onClick={onCreate}>Create a tag</button>
        </div>
      ) : (
        <ul className="td-picklist td-picklist-box" aria-label="Tags">
          {shown.map((t) => (
            <li key={t.id}>
              <label className="td-pick">
                <TagDot color={t.color} />
                <span className="td-pick-label">{t.name}</span>
                <input type="checkbox" className="td-check" checked={selected.includes(t.id)} onChange={() => onToggle(t.id)} />
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Create new tag" modal: name + colour swatches (HEL-103). */
export function CreateTagDialog({ open, onClose, onCreated, existing }: {
  open: boolean; onClose: () => void; onCreated: (t: Tag) => void; existing: Tag[];
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_COLOR_KEYS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const trimmed = name.trim();
  const dupe = existing.some((t) => t.name.toLowerCase() === trimmed.toLowerCase());

  async function submit() {
    if (!trimmed || dupe) return;
    setSaving(true); setError(null);
    try {
      const t = await createTag(trimmed, color);
      setName(""); setColor(TAG_COLOR_KEYS[0]);
      onCreated(t);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="td-scrim td-scrim-top" />
        <DialogPrimitive.Content className="mh-shell td-modal" aria-describedby={undefined}
          onOpenAutoFocus={(e) => { e.preventDefault(); document.getElementById(nameId)?.focus(); }}>
          <header className="td-head td-head-modal">
            <DialogPrimitive.Title className="td-eyebrow">Create new tag</DialogPrimitive.Title>
            <span className="td-head-right">
              <DialogPrimitive.Close className="td-iconbtn" aria-label="Close"><X aria-hidden /></DialogPrimitive.Close>
            </span>
          </header>
          <form className="td-modal-body" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <ErrorNote message={error} onDismiss={() => setError(null)} />
            <div className="td-field">
              <label htmlFor={nameId} className="td-field-label">Tag name</label>
              <input id={nameId} className="td-input" value={name} maxLength={40}
                onChange={(e) => setName(e.target.value)} placeholder="e.g. Work trip" />
              {dupe && <span className="td-field-err">You already have a tag called “{trimmed}”.</span>}
            </div>
            <fieldset className="td-card td-swatches">
              <legend className="td-card-title">Pick a colour</legend>
              <div className="td-swatch-row">
                {TAG_COLOR_KEYS.map((k) => (
                  <label key={k} className="td-swatch" data-on={color === k} title={TAG_SWATCHES[k].label}>
                    <input type="radio" name={`${nameId}-c`} className="sr-only" checked={color === k} onChange={() => setColor(k)}
                      aria-label={TAG_SWATCHES[k].label} />
                    <TagDot color={k} />
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="td-actions">
              <button type="button" className="td-btn-sm" onClick={onClose}>Cancel</button>
              <button type="submit" className="td-btn-sm td-btn-ink" disabled={!trimmed || dupe || saving}>
                {saving ? "Creating…" : "Create new tag"}
              </button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
