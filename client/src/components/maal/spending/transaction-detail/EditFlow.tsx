import { useId, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { iconForGroup } from "../overview/categoryIcons";
import { bulkEdit, type BulkChanges, type CategoryGroup, type Tag } from "./api";
import { CategoryList, CreateTagDialog, TagList, type CategoryValue } from "./pickers";
import { EditorActions, ErrorNote, PanelHeader, TagChip } from "./ui";

/** The fields the edit flow reads from each selected row (GET /transactions shape). */
export type EditableRow = {
  id: string | number;
  description?: string | null;
  category_group?: string | null;
  category?: string | null;
  category_source?: string | null;
  hidden?: boolean;
  reviewed?: boolean;
  merchant_name?: string | null;
  description_override?: string | null;
  tags?: Tag[];
};

type View = "list" | "category" | "visibility" | "merchant" | "description" | "tags" | "status" | "review";
const VIEW_TITLE: Record<Exclude<View, "list" | "review">, string> = {
  category: "Update category", visibility: "Transaction visibility", merchant: "Rename merchant",
  description: "Change description", tags: "Tags", status: "Review",
};

/**
 * What to send to undo `changes` on `rows`: one bulk-edit per distinct
 * previous state (rows that started the same are restored together).
 */
export function undoPlan(rows: EditableRow[], changes: BulkChanges): Array<{ ids: Array<string | number>; changes: BulkChanges }> {
  const groups = new Map<string, { ids: Array<string | number>; changes: BulkChanges }>();
  for (const r of rows) {
    const prev: BulkChanges = {};
    if (changes.category !== undefined) {
      prev.category = (r.category_source === "manual" || r.category_source === "rule") && r.category_group
        ? { category_group: r.category_group, category: r.category || null } : null;
    }
    if (changes.hidden !== undefined) prev.hidden = !!r.hidden;
    if (changes.reviewed !== undefined) prev.reviewed = !!r.reviewed;
    if (changes.merchant_name !== undefined) prev.merchant_name = r.merchant_name || null;
    if (changes.description !== undefined) prev.description = r.description_override || null;
    if (changes.add_tag_ids || changes.set_tag_ids) prev.set_tag_ids = (r.tags || []).map((t) => t.id);
    const key = JSON.stringify(prev);
    const g = groups.get(key) || { ids: [], changes: prev };
    g.ids.push(r.id);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/**
 * "Editing N transactions" (HEL-97..99, HEL-103): stage category, visibility,
 * merchant name, description, tags and review status, review, then apply in
 * one bulk edit. Calls onApplied with an undo callback.
 */
export function EditFlow({ rows, groups, tags, onTagCreated, onBack, onApplied }: {
  rows: EditableRow[];
  groups: CategoryGroup[];
  tags: Tag[];
  onTagCreated: (t: Tag) => void;
  onBack?: () => void;
  onApplied: (count: number, undo: () => Promise<void>) => void;
}) {
  const [view, setView] = useState<View>("list");
  const [staged, setStaged] = useState<BulkChanges>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = rows.length;
  const title = `Editing ${n} transaction${n === 1 ? "" : "s"}`;
  const single = n === 1 ? rows[0] : null;
  const stagedCount = Object.keys(staged).length;

  const stage = (patch: BulkChanges, drop?: keyof BulkChanges) => {
    setStaged((s) => {
      const next = { ...s, ...patch };
      if (drop) delete next[drop];
      return next;
    });
    setView("list");
  };

  async function apply() {
    setSaving(true); setError(null);
    const ids = rows.map((r) => r.id);
    const plan = undoPlan(rows, staged);
    try {
      const count = await bulkEdit(ids, staged);
      onApplied(count, async () => { for (const step of plan) await bulkEdit(step.ids, step.changes); });
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  const tagName = (id: string) => tags.find((t) => t.id === id);
  const summary = describeChanges(staged, tagName);

  if (view === "list" || view === "review") {
    return (
      <>
        <PanelHeader title={title} onBack={view === "review" ? () => setView("list") : onBack}
          backLabel={view === "review" ? "Back to editing" : "Back to transaction"} />
        <div className="td-body">
          <ErrorNote message={error} onDismiss={() => setError(null)} />
          {view === "list" ? (
            <>
              <div className="td-card">
                <EditRow label="Update category" value={summary.category} onClick={() => setView("category")} />
                <EditRow label="Transaction visibility" value={summary.hidden} onClick={() => setView("visibility")} />
                <EditRow label="Rename merchant" value={summary.merchant_name} onClick={() => setView("merchant")} />
                <EditRow label="Change description" value={summary.description} onClick={() => setView("description")} />
                <EditRow label="Add tag" value={summary.tags} onClick={() => setView("tags")} />
                <EditRow label="Review status" value={summary.reviewed} onClick={() => setView("status")} />
              </div>
              <div className="td-actions">
                <button type="button" className="td-btn-sm td-btn-ink" disabled={!stagedCount} onClick={() => setView("review")}>
                  Review changes
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="td-card">
                <h3 className="td-card-title">Changes to {n} transaction{n === 1 ? "" : "s"}</h3>
                <ul className="td-review-list">
                  {Object.entries(summary).filter(([, v]) => v).map(([k, v]) => (
                    <li key={k}><span className="td-muted">{REVIEW_LABEL[k as keyof typeof REVIEW_LABEL]}</span><span>{v}</span></li>
                  ))}
                </ul>
              </div>
              <div className="td-actions">
                <button type="button" className="td-btn-sm" onClick={() => setView("list")} disabled={saving}>Keep editing</button>
                <button type="button" className="td-btn-sm td-btn-ink" onClick={() => void apply()} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHeader title={title} onBack={() => setView("list")} backLabel="Back to editing" />
      <div className="td-body">
        {view === "category" && (
          <CategoryEditor groups={groups} initial={staged.category ? { group: staged.category.category_group, category: staged.category.category } : null}
            onReset={() => stage({}, "category")}
            onSave={(v) => stage({ category: { category_group: v.group, category: v.category } })} />
        )}
        {view === "visibility" && (
          <SelectEditor label={VIEW_TITLE.visibility} field="Visibility"
            options={[["show", "Show in spending"], ["hide", "Hide from spending"]]}
            initial={staged.hidden === undefined ? "" : staged.hidden ? "hide" : "show"}
            onReset={() => stage({}, "hidden")} onSave={(v) => stage({ hidden: v === "hide" })} />
        )}
        {view === "status" && (
          <SelectEditor label={VIEW_TITLE.status} field="Review transactions"
            options={[["unreviewed", "Mark as unreviewed"], ["reviewed", "Mark as reviewed"]]}
            initial={staged.reviewed === undefined ? "" : staged.reviewed ? "reviewed" : "unreviewed"}
            onReset={() => stage({}, "reviewed")} onSave={(v) => stage({ reviewed: v === "reviewed" })} />
        )}
        {view === "merchant" && (
          <TextEditor label={VIEW_TITLE.merchant} field="Merchant name" max={120}
            placeholder={single ? (single.merchant_name || single.description || "") : "New merchant name"}
            initial={staged.merchant_name ?? (single?.merchant_name || "")}
            hint="Leave it empty to go back to the name from your bank."
            onReset={() => stage({}, "merchant_name")} onSave={(v) => stage({ merchant_name: v || null })} />
        )}
        {view === "description" && (
          <TextEditor label={VIEW_TITLE.description} field="Description" max={240}
            placeholder={single?.description || "New description"}
            initial={staged.description ?? (single?.description_override || "")}
            hint="Leave it empty to go back to the description from your bank."
            onReset={() => stage({}, "description")} onSave={(v) => stage({ description: v || null })} />
        )}
        {view === "tags" && (
          <TagsEditor tags={tags} initial={staged.add_tag_ids || []} onTagCreated={onTagCreated}
            onReset={() => stage({}, "add_tag_ids")}
            onSave={(ids) => ids.length ? stage({ add_tag_ids: ids }) : stage({}, "add_tag_ids")} />
        )}
      </div>
    </>
  );
}

const REVIEW_LABEL = {
  category: "Category", hidden: "Visibility", merchant_name: "Merchant", description: "Description", tags: "Add tags", reviewed: "Review status",
};

function describeChanges(c: BulkChanges, tagName: (id: string) => Tag | undefined) {
  return {
    category: c.category === undefined ? "" : c.category ? `${c.category.category_group}${c.category.category ? ` · ${c.category.category}` : ""}` : "Automatic",
    hidden: c.hidden === undefined ? "" : c.hidden ? "Hidden from spending" : "Shown in spending",
    merchant_name: c.merchant_name === undefined ? "" : c.merchant_name || "Name from your bank",
    description: c.description === undefined ? "" : c.description || "Description from your bank",
    tags: c.add_tag_ids ? c.add_tag_ids.map((id) => tagName(id)?.name).filter(Boolean).join(", ") : "",
    reviewed: c.reviewed === undefined ? "" : c.reviewed ? "Reviewed" : "Unreviewed",
  };
}

function EditRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" className="td-row" onClick={onClick}>
      <span className="td-row-label">{label}</span>
      <span className="td-row-value">{value && <span className="td-staged">{value}</span>}<ChevronRight className="td-chev" aria-hidden /></span>
    </button>
  );
}

function EditorCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="td-card">
      <h3 className="td-card-title td-card-title-line">{label}</h3>
      <div className="td-card-pad">{children}</div>
    </section>
  );
}

export function CategoryEditor({ groups, initial, onSave, onReset, saving, saveLabel }: {
  groups: CategoryGroup[]; initial: CategoryValue | null; onSave: (v: CategoryValue) => void; onReset?: () => void; saving?: boolean; saveLabel?: string;
}) {
  const [value, setValue] = useState<CategoryValue | null>(initial);
  const Icon = iconForGroup(value?.group);
  return (
    <>
      <EditorCard label="Update category">
        {value && (
          <p className="td-chosen"><span className="td-cat-icon" aria-hidden><Icon /></span>
            {value.group}{value.category ? ` · ${value.category}` : ""}</p>
        )}
        {groups.length === 0 ? <p className="td-muted m-0">Categories couldn’t load right now.</p> : (
          <CategoryList groups={groups} value={value} onChange={setValue} />
        )}
      </EditorCard>
      <EditorActions onReset={onReset ? () => { setValue(null); onReset(); } : undefined}
        onSave={() => value && onSave(value)} disabled={!value} saving={saving} saveLabel={saveLabel} />
    </>
  );
}

function SelectEditor({ label, field, options, initial, onSave, onReset }: {
  label: string; field: string; options: Array<[string, string]>; initial: string; onSave: (v: string) => void; onReset: () => void;
}) {
  const [v, setV] = useState(initial);
  const id = useId();
  return (
    <>
      <EditorCard label={label}>
        <div className="td-field">
          <label htmlFor={id} className="td-field-label">{field}</label>
          <select id={id} className="td-input td-select" value={v} onChange={(e) => setV(e.target.value)}>
            <option value="" disabled>Select</option>
            {options.map(([val, text]) => <option key={val} value={val}>{text}</option>)}
          </select>
        </div>
      </EditorCard>
      <EditorActions onReset={() => { setV(""); onReset(); }} onSave={() => onSave(v)} disabled={!v} />
    </>
  );
}

export function TextEditor({ label, field, initial, placeholder, max, hint, onSave, onReset, saving, multiline }: {
  label: string; field: string; initial: string; placeholder?: string; max: number; hint?: string;
  onSave: (v: string) => void; onReset?: () => void; saving?: boolean; multiline?: boolean;
}) {
  const [v, setV] = useState(initial);
  const id = useId();
  return (
    <>
      <EditorCard label={label}>
        <div className="td-field">
          <label htmlFor={id} className="td-field-label">{field}</label>
          {multiline ? (
            <textarea id={id} className="td-input td-textarea" value={v} maxLength={max} placeholder={placeholder}
              onChange={(e) => setV(e.target.value)} rows={4} />
          ) : (
            <input id={id} className="td-input" value={v} maxLength={max} placeholder={placeholder} onChange={(e) => setV(e.target.value)} />
          )}
          {hint && <span className="td-field-hint">{hint}</span>}
        </div>
      </EditorCard>
      <EditorActions onReset={onReset ? () => { setV(""); onReset(); } : undefined} onSave={() => onSave(v.trim())} saving={saving} />
    </>
  );
}

function TagsEditor({ tags, initial, onSave, onReset, onTagCreated }: {
  tags: Tag[]; initial: string[]; onSave: (ids: string[]) => void; onReset: () => void; onTagCreated: (t: Tag) => void;
}) {
  const [sel, setSel] = useState<string[]>(initial);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <EditorCard label="Tags">
        {sel.length > 0 && (
          <p className="td-chosen td-chosen-tags">
            {sel.map((id) => { const t = tags.find((x) => x.id === id); return t ? <TagChip key={id} name={t.name} color={t.color} /> : null; })}
          </p>
        )}
        <TagList tags={tags} selected={sel} onCreate={() => setCreating(true)}
          emptyHint="No tags found. Create one to group transactions like work trips or tax deductions."
          onToggle={(id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])} />
        {tags.length > 0 && (
          <button type="button" className="td-btn-sm td-mt" onClick={() => setCreating(true)}>Create</button>
        )}
      </EditorCard>
      <EditorActions onReset={() => { setSel([]); onReset(); }} onSave={() => onSave(sel)} />
      <CreateTagDialog open={creating} existing={tags} onClose={() => setCreating(false)}
        onCreated={(t) => { onTagCreated(t); setSel((s) => [...s, t.id]); setCreating(false); }} />
    </>
  );
}
