import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, ChevronLeft, ChevronRight, History, Plus, RotateCcw, Trash2, Wallet, X } from "lucide-react";
import { getCategoryGroups, listRules, deleteRule, type CategoryGroup, type TxnRule } from "@/lib/transactions-depth.functions";
import {
  aud, getBudgets, getSpendingSettings, resetBudgets, saveBudget, updateSpendingSettings,
  type SpendingSettings,
} from "./api";
import { CreateRuleFlow } from "../rules/CreateRuleFlow";
import { ManageTagsDialog } from "../transaction-detail/ManageTagsDialog";
import "./spending-settings.css";

/**
 * Spending settings drawer (Figma: "Spending settings", "Updating transaction
 * settings from Spending settings", "Deleting a budget from Spending settings").
 * Panels: main → Manage categories | Manage budget → Reset budget.
 */
type Panel = "main" | "categories" | "budget" | "reset";
const TITLES: Record<Panel, string> = {
  main: "Spending settings",
  categories: "Manage categories",
  budget: "Manage budget",
  reset: "Reset budget",
};
const PARENT: Record<Panel, Panel | null> = { main: null, categories: "main", budget: "main", reset: "budget" };

export function SpendingSettingsDrawer({ onClose, initialPanel }: { onClose: () => void; initialPanel?: "budget" | "categories" }) {
  const [panel, setPanel] = useState<Panel>(initialPanel ?? "main");
  const [settings, setSettings] = useState<SpendingSettings | null>(null);
  const [budgetTotal, setBudgetTotal] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadBudget = useCallback(() => {
    getBudgets().then((b) => setBudgetTotal(b.total)).catch((e: Error) => setLoadError(e.message));
  }, []);
  useEffect(() => {
    getSpendingSettings().then(setSettings).catch((e: Error) => setLoadError(e.message));
    loadBudget();
  }, [loadBudget]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  /** Optimistic settings update; reverts and reports on failure. */
  async function patchSettings(patch: Partial<SpendingSettings>) {
    if (!settings) return;
    const prev = settings;
    setSettings({ ...settings, ...patch });
    try { setSettings(await updateSpendingSettings(patch)); }
    catch (e) { setSettings(prev); setLoadError((e as Error).message); }
  }

  const parent = PARENT[panel];
  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ss-scrim" />
        <DialogPrimitive.Content className="mh-shell ss-drawer" aria-describedby={undefined}>
          <header className="ss-head">
            {parent && (
              <button type="button" className="ss-iconbtn" onClick={() => setPanel(parent)} aria-label={`Back to ${TITLES[parent].toLowerCase()}`}>
                <ChevronLeft aria-hidden />
              </button>
            )}
            <DialogPrimitive.Title className="ss-eyebrow">{TITLES[panel]}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="ss-iconbtn ss-close" aria-label="Close spending settings">
              <X aria-hidden />
            </DialogPrimitive.Close>
          </header>

          {toast && (
            <div className="ss-toast" role="status" aria-live="polite">
              <Check className="ss-toast-icon" aria-hidden />
              <span>{toast}</span>
              <button type="button" className="ss-iconbtn" onClick={() => setToast(null)} aria-label="Dismiss">
                <X aria-hidden />
              </button>
            </div>
          )}

          <div className="ss-body">
            {loadError && (
              <p className="ss-error" role="alert">
                {loadError}{" "}
                <button type="button" className="ss-link" onClick={() => setLoadError(null)}>Dismiss</button>
              </p>
            )}
            {panel === "main" && <MainPanel onOpen={setPanel} onNavigate={onClose} />}
            {panel === "categories" && <CategoriesPanel settings={settings} onChange={patchSettings} />}
            {panel === "budget" && (
              <BudgetPanel settings={settings} total={budgetTotal} onChange={patchSettings}
                onSaved={loadBudget} onReset={() => setPanel("reset")} onError={setLoadError} />
            )}
            {panel === "reset" && (
              <ResetPanel total={budgetTotal} onError={setLoadError}
                onDone={() => { setBudgetTotal(0); setToast("Your budget has been reset"); }} />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ---------------- shared bits ---------------- */

function Row({ children, onClick, to, onNavigate }: { children: ReactNode; onClick?: () => void; to?: "/app/transactions"; onNavigate?: () => void }) {
  if (to) {
    return (
      <Link to={to} className="ss-row" onClick={onNavigate}>
        <span className="ss-row-label">{children}</span>
        <ChevronRight className="ss-chev" aria-hidden />
      </Link>
    );
  }
  return (
    <button type="button" className="ss-row" onClick={onClick}>
      <span className="ss-row-label">{children}</span>
      <ChevronRight className="ss-chev" aria-hidden />
    </button>
  );
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      className="ss-switch" data-on={checked} onClick={() => onChange(!checked)}>
      <span className="ss-switch-thumb" />
    </button>
  );
}

/* ---------------- main ---------------- */

function MainPanel({ onOpen, onNavigate }: { onOpen: (p: Panel) => void; onNavigate: () => void }) {
  const [rules, setRules] = useState<TxnRule[] | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // Opened by the "Add rule" button.
  const [createRuleOpen, setCreateRuleOpen] = useState(false);
  const [manageTagsOpen, setManageTagsOpen] = useState(false);

  const refreshRules = useCallback(() => { listRules().then(setRules); }, []);
  useEffect(() => { refreshRules(); }, [refreshRules]);

  async function remove(id: number) {
    setBusyId(id);
    const ok = await deleteRule(id);
    setBusyId(null);
    setConfirmId(null);
    if (ok) setRules((r) => (r ?? []).filter((x) => x.id !== id));
  }

  return (
    <>
      <section className="ss-card" aria-label="Spending options">
        <Row onClick={() => onOpen("categories")}>Manage categories</Row>
        <Row onClick={() => onOpen("budget")}>Manage budget</Row>
        <Row to="/app/transactions" onNavigate={onNavigate}>Review transactions</Row>
      </section>

      <section className="ss-card" aria-labelledby="ss-rules-h">
        <h2 id="ss-rules-h" className="ss-card-head ss-eyebrow">Rules</h2>
        <div className="ss-card-list">
          {rules === null ? (
            <p className="ss-muted ss-pad">Loading your rules…</p>
          ) : rules.length === 0 ? (
            <p className="ss-muted ss-pad">No rules yet. Rules sort matching transactions into a category for you.</p>
          ) : (
            <ul className="ss-list">
              {rules.map((r) => (
                <li key={r.id} className="ss-list-row">
                  {confirmId === r.id ? (
                    <div className="ss-confirm">
                      <span>Delete this rule? Past categories stay as they are.</span>
                      <span className="ss-confirm-actions">
                        <button type="button" className="ss-btn-sm" onClick={() => setConfirmId(null)}>Cancel</button>
                        <button type="button" className="ss-btn-sm ss-btn-danger" disabled={busyId === r.id} onClick={() => remove(r.id)}>
                          {busyId === r.id ? "Deleting…" : "Delete"}
                        </button>
                      </span>
                    </div>
                  ) : (
                    <>
                      <span className="ss-rule">
                        <span className="ss-rule-match">{matchLabel(r)}</span>
                        <span className="ss-muted">{r.category ? `${r.category_group} · ${r.category}` : r.category_group}</span>
                      </span>
                      <button type="button" className="ss-iconbtn" onClick={() => setConfirmId(r.id)} aria-label={`Delete rule for ${r.match_text}`}>
                        <Trash2 aria-hidden />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="ss-card-foot">
          <CreateRuleFlow open={createRuleOpen} onClose={() => setCreateRuleOpen(false)} onCreated={refreshRules} />
          <button type="button" className="ss-btn-line" onClick={() => setCreateRuleOpen(true)}>
            <Plus aria-hidden /> Add rule
          </button>
        </div>
      </section>

      <section className="ss-card" aria-label="Tags">
        <Row onClick={() => setManageTagsOpen(true)}>Manage tags</Row>
      </section>
      {manageTagsOpen && <ManageTagsDialog onClose={() => setManageTagsOpen(false)} />}
    </>
  );
}

function matchLabel(r: TxnRule) {
  const how = r.match_type === "equals" ? "is" : r.match_type === "starts_with" ? "starts with" : "contains";
  const dir = r.amount_direction === "debit" ? " (money out)" : r.amount_direction === "credit" ? " (money in)" : "";
  return `Description ${how} “${r.match_text}”${dir}`;
}

/* ---------------- manage categories ---------------- */

function CategoriesPanel({ settings, onChange }: { settings: SpendingSettings | null; onChange: (p: Partial<SpendingSettings>) => void }) {
  const [groups, setGroups] = useState<CategoryGroup[] | null>(null);
  useEffect(() => { getCategoryGroups().then(setGroups); }, []);

  if (!settings || !groups) return <p className="ss-muted">Loading categories…</p>;
  const excluded = new Set(settings.excluded_groups);
  function toggle(group: string, counted: boolean) {
    const next = new Set(excluded);
    if (counted) next.delete(group); else next.add(group);
    onChange({ excluded_groups: [...next] });
  }
  return (
    <>
      <p className="ss-intro">
        Choose which categories count towards your spending and budget. Turning one off doesn't delete anything: the
        transactions stay in your accounts, they just aren't added to your spending.
      </p>
      {groups.length === 0 ? (
        <p className="ss-muted">We couldn't load the categories. Please try again.</p>
      ) : (
        <ul className="ss-card ss-list" aria-label="Categories">
          {groups.map((g) => (
            <li key={g.group} className="ss-list-row ss-cat">
              <span className="ss-rule">
                <span>{g.group}</span>
                <span className="ss-muted ss-small">{g.categories.join(", ")}</span>
              </span>
              <Switch checked={!excluded.has(g.group)} onChange={(v) => toggle(g.group, v)} label={`Count ${g.group} in spending`} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ---------------- manage budget ---------------- */

function BudgetPanel({ settings, total, onChange, onSaved, onReset, onError }: {
  settings: SpendingSettings | null; total: number | null;
  onChange: (p: Partial<SpendingSettings>) => void; onSaved: () => void; onReset: () => void; onError: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try { await saveBudget({ category_group: null, monthly_amount: amount }); setEditing(false); onSaved(); }
    catch (err) { onError((err as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="ss-plain">
      <div className="ss-setting">
        <Wallet className="ss-setting-icon" aria-hidden />
        <div className="ss-setting-text">
          <span className="ss-setting-title">Monthly budget</span>
          {editing ? (
            <form className="ss-amount" onSubmit={save}>
              <label className="sr-only" htmlFor="ss-amount">Monthly budget in AUD</label>
              <span className="ss-amount-field">
                <span aria-hidden>$</span>
                <input id="ss-amount" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="2,500" />
              </span>
              <button type="submit" className="ss-btn-sm ss-btn-ink" disabled={saving || !amount.trim()}>{saving ? "Saving…" : "Save"}</button>
              <button type="button" className="ss-btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            </form>
          ) : (
            <span className="ss-setting-sub">
              {total === null ? "Loading…" : total > 0 ? `${aud(total)} a month` : "No budget set yet"}
            </span>
          )}
        </div>
        {!editing && (
          <button type="button" className="ss-btn-sm" onClick={() => { setAmount(total ? String(total) : ""); setEditing(true); }}>
            {total ? "Edit" : "Set budget"}
          </button>
        )}
      </div>

      <div className="ss-setting">
        <History className="ss-setting-icon" aria-hidden />
        <div className="ss-setting-text">
          <span className="ss-setting-title" id="ss-upcoming">Upcoming spend</span>
          <span className="ss-setting-sub">Count upcoming bills and recurring payments in your budget</span>
        </div>
        <Switch checked={settings?.include_upcoming ?? true} disabled={!settings}
          onChange={(v) => onChange({ include_upcoming: v })} label="Upcoming spend" />
      </div>

      <button type="button" className="ss-setting ss-setting-btn" onClick={onReset}>
        <RotateCcw className="ss-setting-icon" aria-hidden />
        <span className="ss-setting-text"><span className="ss-setting-title">Reset budget</span></span>
        <ChevronRight className="ss-chev" aria-hidden />
      </button>
    </div>
  );
}

/* ---------------- reset budget ---------------- */

function ResetPanel({ total, onDone, onError }: { total: number | null; onDone: () => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const none = total !== null && total <= 0;
  async function run() {
    setBusy(true);
    try { await resetBudgets(); onDone(); }
    catch (e) { onError((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <div className="ss-plain">
      <p className="ss-intro">
        Deleting your budget won't remove any of your transactions. You can set up a new budget at any time.
      </p>
      <button type="button" className="ss-btn-delete" onClick={run} disabled={busy || none || total === null}>
        {busy ? "Deleting…" : "Delete budget"}
      </button>
      {none && <p className="ss-muted ss-small ss-center">You don't have a budget set right now.</p>}
    </div>
  );
}
