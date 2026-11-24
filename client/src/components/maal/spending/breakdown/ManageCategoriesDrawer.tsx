import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, ChevronDown, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { CATEGORY_COLORS, createGroup, deleteCategory, deleteGroup, updateCategory, updateGroup, type CategoryGroupDef, type CustomCategory } from "./api";
import { CategoryAppearancePicker } from "./NewCategoryDrawer";
import { BUILT_IN_GROUPS, CatIcon, ErrorLine, Toast } from "./parts";
import "../settings/spending-settings.css";

const INCOME_BUILT_IN = ["Income"];
const MOVEMENT = ["Transfers", "Credit Card Payments"];

/**
 * Manage categories (HEL-90): every category, sorted into the user's groups
 * (then ungrouped), with Expense and Income sections. "Create group" opens the
 * new-group dialog (name, colour, categories); "Create category" opens HEL-89.
 * Custom categories and groups can be edited or deleted here.
 */
export function ManageCategoriesDrawer({ custom, groups, onClose, onChanged, onNewCategory }: {
  custom: CustomCategory[];
  groups: CategoryGroupDef[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onNewCategory: (kind: "expense" | "income") => void;
}) {
  const [q, setQ] = useState("");
  const [newGroup, setNewGroup] = useState<null | "expense" | "income">(null);
  const [toast, setToast] = useState<{ title: string; text?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  function startEdit(id: string) {
    setErr(null);
    setConfirm(null);
    setEditing(id);
  }

  async function saved() {
    setEditing(null);
    await onChanged();
    setToast({ title: "Changes saved" });
  }

  const expenseAll = useMemo(() => [
    ...BUILT_IN_GROUPS.filter((g) => !INCOME_BUILT_IN.includes(g) && !MOVEMENT.includes(g)),
    ...custom.filter((c) => c.kind === "expense").map((c) => c.name),
  ], [custom]);
  const incomeAll = useMemo(() => [...INCOME_BUILT_IN, ...custom.filter((c) => c.kind === "income").map((c) => c.name)], [custom]);
  const match = (n: string) => n.toLowerCase().includes(q.trim().toLowerCase());

  async function removeCategory(c: CustomCategory) {
    setErr(null);
    try { await deleteCategory(c.id); await onChanged(); setToast({ title: "Category deleted", text: `“${c.name}” and its budget were removed. Its transactions go back to their usual category.` }); }
    catch (e) { setErr((e as Error).message); }
    finally { setConfirm(null); }
  }
  async function removeGroup(g: CategoryGroupDef) {
    setErr(null);
    try { await deleteGroup(g.id); await onChanged(); setToast({ title: "Group deleted", text: `Its categories are now ungrouped.` }); }
    catch (e) { setErr((e as Error).message); }
    finally { setConfirm(null); }
  }

  function renderSection(kind: "expense" | "income", all: string[]) {
    const kindGroups = groups.filter((g) => g.kind === kind);
    const grouped = new Set(kindGroups.flatMap((g) => g.categories));
    const ungrouped = all.filter((c) => !grouped.has(c));
    const blocks: Array<{ key: string; title: string; group?: CategoryGroupDef; items: string[] }> = [
      ...kindGroups.map((g) => ({ key: g.id, title: g.name, group: g, items: g.categories.filter((c) => all.includes(c)) })),
      { key: `${kind}-rest`, title: kindGroups.length ? "Ungrouped" : kind === "expense" ? "Expenses" : "Income", items: ungrouped },
    ];
    return (
      <section className="bd-msec" aria-label={kind === "expense" ? "Expense categories" : "Income categories"}>
        <div className="bd-msec-head">
          <h3>{kind === "expense" ? "Expense" : "Income"}</h3>
          <button type="button" className="ss-btn-sm bd-btn-icon" onClick={() => setNewGroup(kind)}><Plus aria-hidden /> Create group</button>
        </div>
        {blocks.map((b) => {
          const items = b.items.filter(match);
          const group = b.group;
          if (q && !items.length && (!group || !match(group.name))) return null;
          return (
            <div key={b.key} className="ss-card bd-mblock">
              <div className="bd-mblock-head">
                {group && <i className="bd-dot" style={{ background: group.color }} aria-hidden />}
                <span className="bd-mblock-title">{b.title}</span>
                {group && editing !== `g${group.id}` && (confirm === `g${group.id}` ? (
                  <span className="ss-confirm-actions">
                    <button type="button" className="ss-btn-sm ss-btn-danger" onClick={() => removeGroup(group)}>Delete group</button>
                    <button type="button" className="ss-btn-sm" onClick={() => setConfirm(null)}>Keep</button>
                  </span>
                ) : (
                  <>
                    <button type="button" className="ss-iconbtn" onClick={() => startEdit(`g${group.id}`)} aria-label={`Rename group ${b.title}`}><Pencil aria-hidden /></button>
                    <button type="button" className="ss-iconbtn" onClick={() => { setEditing(null); setConfirm(`g${group.id}`); }} aria-label={`Delete group ${b.title}`}><Trash2 aria-hidden /></button>
                  </>
                ))}
              </div>
              {group && editing === `g${group.id}` && (
                <InlineEditor item={group} onCancel={() => setEditing(null)} onSaved={saved} />
              )}
              <ul className="ss-list">
                {items.length === 0 && <li className="ss-list-row mh-muted mh-small">No categories in this group yet.</li>}
                {items.map((name) => {
                  const c = custom.find((x) => x.name === name);
                  return (
                    <li key={c?.id ? `custom-${c.id}` : name}>
                      <div className="ss-list-row bd-mrow">
                        <CatIcon name={name} custom={custom} size={30} />
                        <span className="flex-1 min-w-0 bd-trunc">{name}</span>
                        {c && editing !== `c${c.id}` && (confirm === `c${c.id}` ? (
                          <span className="ss-confirm-actions">
                            <button type="button" className="ss-btn-sm ss-btn-danger" onClick={() => removeCategory(c)}>Delete</button>
                            <button type="button" className="ss-btn-sm" onClick={() => setConfirm(null)}>Keep</button>
                          </span>
                        ) : (
                          <>
                            <button type="button" className="ss-iconbtn" onClick={() => startEdit(`c${c.id}`)} aria-label={`Edit category ${name}`}><Pencil aria-hidden /></button>
                            <button type="button" className="ss-iconbtn" onClick={() => { setEditing(null); setConfirm(`c${c.id}`); }} aria-label={`Delete ${name}`}><Trash2 aria-hidden /></button>
                          </>
                        ))}
                      </div>
                      {c && editing === `c${c.id}` && (
                        <InlineEditor item={c} onCancel={() => setEditing(null)} onSaved={saved} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        <button type="button" className="ss-btn-sm bd-btn-icon bd-mcreate" onClick={() => onNewCategory(kind)}><Plus aria-hidden /> Create category</button>
      </section>
    );
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o && !newGroup) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ss-scrim" />
        <DialogPrimitive.Content className="mh-shell ss-drawer bd-drawer" aria-describedby={undefined}>
          <header className="ss-head">
            <DialogPrimitive.Title className="ss-eyebrow">Manage categories</DialogPrimitive.Title>
            <DialogPrimitive.Close className="ss-iconbtn ss-close" aria-label="Close manage categories"><X aria-hidden /></DialogPrimitive.Close>
          </header>
          {toast && <Toast title={toast.title} text={toast.text} onClose={() => setToast(null)} />}
          <div className="ss-body">
            <label className="bd-search">
              <Search aria-hidden />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search categories" aria-label="Search categories" />
            </label>
            {err && <ErrorLine>{err}</ErrorLine>}
            {renderSection("expense", expenseAll)}
            {renderSection("income", incomeAll)}
            <p className="mh-muted mh-small m-0">Transfers and card repayments move money between your own accounts, so they aren’t counted as spending and can’t be grouped.</p>
          </div>
          {newGroup && (
            <NewGroupDialog kind={newGroup} available={newGroup === "expense" ? expenseAll : incomeAll} custom={custom} groups={groups}
              onClose={() => setNewGroup(null)}
              onNewCategory={() => { const k = newGroup; setNewGroup(null); onNewCategory(k); }}
              onCreated={async (g) => { setNewGroup(null); await onChanged(); setToast({ title: "Category group created", text: `“${g.name}” now holds ${g.categories.length} ${g.categories.length === 1 ? "category" : "categories"}.` }); }} />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function InlineEditor({ item, onCancel, onSaved }: {
  item: CustomCategory | CategoryGroupDef;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const category = "icon" in item ? item : null;
  const [name, setName] = useState(item.name);
  const [color, setColor] = useState(item.color);
  const [icon, setIcon] = useState(category?.icon ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (category) {
        await updateCategory(category.id, {
          name: name.trim(),
          ...(color !== category.color ? { color } : {}),
          ...(icon !== category.icon ? { icon } : {}),
        });
      } else {
        await updateGroup(item.id, { name: name.trim() });
      }
      await onSaved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="bd-inline-editor" onSubmit={(event) => { event.preventDefault(); if (name.trim() && !busy) void save(); }}>
      <label className="bd-field bd-field-box">
        <span>{category ? "Category name" : "Group name"}</span>
        <input value={name} maxLength={40} autoFocus onChange={(event) => setName(event.target.value)} disabled={busy} />
      </label>
      {category && <CategoryAppearancePicker color={color} icon={icon} setColor={setColor} setIcon={setIcon} />}
      {error && <ErrorLine>{error}</ErrorLine>}
      <div className="bd-modal-foot">
        <button type="button" className="ss-btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="ss-btn-sm ss-btn-ink" disabled={!name.trim() || busy}>{busy ? "Saving…" : "Save changes"}</button>
      </div>
    </form>
  );
}

/** New group dialog: type, name, colour and a searchable category checklist. */
function NewGroupDialog({ kind, available, custom, groups, onClose, onCreated, onNewCategory }: {
  kind: "expense" | "income";
  available: string[];
  custom: CustomCategory[];
  groups: CategoryGroupDef[];
  onClose: () => void;
  onCreated: (g: CategoryGroupDef) => void;
  onNewCategory: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(CATEGORY_COLORS[8]);
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ownerOf = (c: string) => groups.find((g) => g.categories.includes(c))?.name;
  const shown = available.filter((c) => c.toLowerCase().includes(q.trim().toLowerCase()));
  const allOn = shown.length > 0 && shown.every((c) => picked.includes(c));
  const toggle = (c: string) => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  async function submit() {
    setBusy(true); setErr(null);
    try { onCreated(await createGroup({ name: name.trim(), kind, color, categories: picked })); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <div className="bd-modal-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bd-modal" role="dialog" aria-modal="true" aria-labelledby="bd-ng-title" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
        <header className="bd-modal-head">
          <h2 id="bd-ng-title" className="ss-eyebrow">New group</h2>
          <button type="button" className="ss-iconbtn ss-close" onClick={onClose} aria-label="Close new group"><X aria-hidden /></button>
        </header>
        <form className="bd-modal-body" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void submit(); }}>
          <p className="bd-field bd-field-box bd-field-static"><span>Type</span>{kind === "expense" ? "Expense" : "Income"}</p>
          <label className="bd-field bd-field-box">
            <span>Group name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="For example, Fun" autoFocus />
          </label>
          <fieldset className="ss-card bd-pick">
            <legend>Pick a colour</legend>
            <div className="bd-swatches">
              {CATEGORY_COLORS.map((c) => (
                <button key={c} type="button" className="bd-swatch-btn" style={{ background: c }} aria-pressed={color === c} aria-label={`Colour ${c}`} onClick={() => setColor(c)} />
              ))}
            </div>
          </fieldset>
          <div className="bd-multi">
            <button type="button" className="bd-field bd-field-box bd-multi-btn" aria-expanded={open} aria-label={`Categories: ${picked.length ? picked.join(", ") : "none chosen"}`} onClick={() => setOpen((o) => !o)}>
              <span>Categories</span>
              {picked.length ? (
                <span className="bd-chips">{picked.map((c) => <span key={c} className="bd-chip"><CatIcon name={c} custom={custom} size={18} />{c}</span>)}</span>
              ) : <span className="mh-muted">Choose categories</span>}
              <ChevronDown aria-hidden className="bd-multi-chev" />
            </button>
            {open && (
              <div className="bd-multi-pop">
                <label className="bd-search bd-search-sm">
                  <Search aria-hidden />
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search categories" />
                </label>
                <ul className="bd-multi-list">
                  <li>
                    <button type="button" className="bd-check-row" aria-pressed={allOn} aria-label={`All ${kind} categories`} onClick={() => setPicked((p) => (allOn ? p.filter((x) => !shown.includes(x)) : [...new Set([...p, ...shown])]))}>
                      <span className="flex-1">All {kind === "expense" ? "expense" : "income"} categories</span>
                      <span className="bd-box" data-on={allOn}>{allOn && <Check aria-hidden />}</span>
                    </button>
                  </li>
                  {shown.map((c) => {
                    const owner = ownerOf(c);
                    return (
                      <li key={c}>
                        <button type="button" className="bd-check-row" aria-pressed={picked.includes(c)} aria-label={owner ? `${c} (moves from ${owner})` : c} onClick={() => toggle(c)}>
                          <CatIcon name={c} custom={custom} size={24} />
                          <span className="flex-1 min-w-0"><span className="bd-trunc">{c}</span>{owner && <span className="bd-sub">Moves from {owner}</span>}</span>
                          <span className="bd-box" data-on={picked.includes(c)}>{picked.includes(c) && <Check aria-hidden />}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="bd-multi-foot">
                  <button type="button" className="ss-btn-sm" onClick={onNewCategory}>Create new category</button>
                  <button type="button" className="ss-btn-sm ss-btn-ink" onClick={() => setOpen(false)}>Done</button>
                </div>
              </div>
            )}
          </div>
          {err && <ErrorLine>{err}</ErrorLine>}
          <div className="bd-modal-foot">
            <button type="button" className="mh-link-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="mh-btn-ink" disabled={!name.trim() || busy}>{busy ? "Creating…" : "Create group"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
