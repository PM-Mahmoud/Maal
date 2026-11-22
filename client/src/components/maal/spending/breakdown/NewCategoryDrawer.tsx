import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { CATEGORY_COLORS, createCategory, updateGroup, type CategoryGroupDef, type CustomCategory } from "./api";
import { CUSTOM_ICONS } from "./icons";
import { ErrorLine } from "./parts";
import "../settings/spending-settings.css";

const FIRST_ICONS = 27;

/**
 * Creating a category (HEL-89): name, expense or income, optional group,
 * colour and icon. Saved through POST /api/v1/spending-categories; it then
 * shows everywhere categories are picked (GET /api/v1/transaction-categories).
 */
export function NewCategoryDrawer({ groups, defaultKind = "expense", onClose, onCreated }: {
  groups: CategoryGroupDef[];
  defaultKind?: "expense" | "income";
  onClose: () => void;
  onCreated: (c: CustomCategory) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income">(defaultKind);
  const [groupId, setGroupId] = useState("");
  const [color, setColor] = useState(CATEGORY_COLORS[4]);
  const [icon, setIcon] = useState("tag");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const kindGroups = groups.filter((g) => g.kind === kind);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const c = await createCategory({ name: name.trim(), kind, color, icon });
      const g = kindGroups.find((x) => x.id === groupId);
      if (g) {
        try { await updateGroup(g.id, { categories: [...g.categories, c.name] }); }
        catch { /* category exists; the group can be set later from Manage categories */ }
      }
      onCreated(c);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ss-scrim bd-scrim-top" />
        <DialogPrimitive.Content className="mh-shell ss-drawer bd-drawer bd-drawer-top" aria-describedby={undefined}>
          <header className="ss-head">
            <DialogPrimitive.Title className="ss-eyebrow">New category</DialogPrimitive.Title>
            <DialogPrimitive.Close className="ss-iconbtn ss-close" aria-label="Close new category"><X aria-hidden /></DialogPrimitive.Close>
          </header>
          <form className="ss-body" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void submit(); }}>
            <label className="bd-field bd-field-box">
              <span>Category name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="For example, Pet care" autoFocus />
            </label>
            <label className="bd-field bd-field-box bd-field-select">
              <span>Type</span>
              <select value={kind} onChange={(e) => { setKind(e.target.value as "expense" | "income"); setGroupId(""); }}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              <ChevronDown aria-hidden />
            </label>
            <label className="bd-field bd-field-box bd-field-select">
              <span>Group</span>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">No group</option>
                {kindGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <ChevronDown aria-hidden />
            </label>
            <fieldset className="ss-card bd-pick">
              <legend>Pick a colour</legend>
              <div className="bd-swatches">
                {CATEGORY_COLORS.map((c) => (
                  <button key={c} type="button" className="bd-swatch-btn" style={{ background: c }} aria-pressed={color === c} aria-label={`Colour ${c}`} onClick={() => setColor(c)} />
                ))}
              </div>
            </fieldset>
            <fieldset className="ss-card bd-pick">
              <legend>Pick an icon</legend>
              <div className="bd-icons">
                {(more ? CUSTOM_ICONS : CUSTOM_ICONS.slice(0, FIRST_ICONS)).map(([key, Icon, label]) => (
                  <button key={key} type="button" className="bd-icon-btn" aria-pressed={icon === key} aria-label={label} title={label} onClick={() => setIcon(key)}
                    style={icon === key ? { background: color, color: "#fff" } : undefined}>
                    <Icon aria-hidden />
                  </button>
                ))}
              </div>
              <button type="button" className="mh-link-btn mh-small bd-more-icons" onClick={() => setMore((m) => !m)}>
                {more ? <>Show fewer icons <ChevronUp aria-hidden size={14} /></> : <>Show more icons <ChevronDown aria-hidden size={14} /></>}
              </button>
            </fieldset>
            {err && <ErrorLine>{err}</ErrorLine>}
            <div className="bd-drawer-foot">
              <button type="submit" className="mh-btn-ink" disabled={!name.trim() || busy}>{busy ? "Creating…" : "Create category"}</button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
