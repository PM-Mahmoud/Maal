import { useCallback, useEffect, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, ChevronRight, CircleCheck, EyeOff, Pencil } from "lucide-react";
import { audCents, signedCents } from "@/components/maal/home/format";
import { InstitutionLogo } from "@/components/maal/InstitutionLogo";
import { iconForGroup } from "../overview/categoryIcons";
import {
  getCategoryGroups, getTransactionDetail, listTags, patchMeta, setCategory, setTags,
  type CategoryGroup, type Tag, type TxnDetail,
} from "./api";
import { CategoryEditor, EditFlow, TextEditor, type EditableRow } from "./EditFlow";
import { CreateTagDialog, TagList } from "./pickers";
import { SplitPanel } from "./SplitPanel";
import { ErrorNote, PanelHeader, Switch, TagChip, Toast, longDate, type ToastState } from "./ui";
import "@/components/maal/home/home.css";
import "./transaction-detail.css";

type Panel = "detail" | "category" | "merchant" | "note" | "split" | "edit";

/** Shared Radix shell: scrim + right-hand drawer (full-screen sheet on phones). */
function DrawerShell({ onClose, label, children }: { onClose: () => void; label: string; children: ReactNode }) {
  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="td-scrim" />
        <DialogPrimitive.Content className="mh-shell td-drawer" aria-describedby={undefined} aria-label={label}>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function useToast() {
  const [toast, setToast] = useState<ToastState>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.onUndo ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);
  return [toast, setToast] as const;
}

/**
 * Transaction detail drawer (HEL-96) with in-place editing: category (HEL-98),
 * merchant name, tags (HEL-102/103), hide (HEL-100), split (HEL-101), note,
 * review status (HEL-99), and the full "Editing 1 transaction" flow (HEL-97).
 */
export function TransactionDetailDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged?: () => void }) {
  const [panel, setPanel] = useState<Panel>("detail");
  const [txn, setTxn] = useState<TxnDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [tags, setTagList] = useState<Tag[] | null>(null);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useToast();

  const load = useCallback(async () => {
    try { setTxn(await getTransactionDetail(id)); setLoadError(null); }
    catch (e) { setLoadError((e as Error).message); }
  }, [id]);

  useEffect(() => {
    setTxn(null); setPanel("detail"); void load();
    getCategoryGroups().then(setGroups).catch(() => setGroups([]));
    listTags().then((t) => { setTagList(t); setTagsError(null); }).catch((e: Error) => setTagsError(e.message));
  }, [load]);

  /** Run a write, then refetch the transaction and tell the page. */
  async function write(fn: () => Promise<unknown>, done?: string) {
    setBusy(true); setError(null);
    try {
      await fn();
      await load();
      onChanged?.();
      setPanel("detail");
      if (done) setToast({ text: done });
      return true;
    } catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(false); }
  }

  const merchant = txn ? (txn.merchant_name || txn.description || "Transaction") : "Transaction";

  if (!txn) {
    return (
      <DrawerShell onClose={onClose} label="Transaction">
        <PanelHeader title="Transaction" />
        <div className="td-body">
          {loadError ? (
            <div className="td-empty-box">
              <p className="m-0">{loadError}</p>
              <button type="button" className="td-btn-sm" onClick={() => void load()}>Try again</button>
            </div>
          ) : (
            <div aria-busy="true" aria-label="Loading transaction" className="td-skel-wrap">
              <div className="mh-skel" style={{ height: 56, width: 180, margin: "8px auto" }} />
              <div className="mh-skel" style={{ height: 280 }} />
              <div className="mh-skel" style={{ height: 72 }} />
            </div>
          )}
        </div>
      </DrawerShell>
    );
  }

  const back = () => { setError(null); setPanel("detail"); };
  return (
    <DrawerShell onClose={onClose} label={`Transaction: ${merchant}`}>
      <Toast toast={toast} onClose={() => setToast(null)} />
      {panel === "detail" && (
        <DetailPanel txn={txn} merchant={merchant} tags={tags} tagsError={tagsError} busy={busy} error={error}
          onDismissError={() => setError(null)} onOpen={setPanel}
          onToggleHidden={(v) => void write(() => patchMeta(txn.id, { hidden: v }), v ? "Hidden from your spending" : "Shown in your spending")}
          onToggleReviewed={() => void write(() => patchMeta(txn.id, { reviewed: !txn.reviewed }), txn.reviewed ? "Marked as unreviewed" : "Marked as reviewed")}
          onSaveTags={(ids) => write(() => setTags(txn.id, ids), "Tags saved")}
          onTagCreated={(t) => setTagList((l) => [...(l || []), t].sort((a, b) => a.name.localeCompare(b.name)))} />
      )}
      {panel === "category" && (
        <>
          <PanelHeader title={merchant} onBack={back} backLabel="Back to transaction" />
          <div className="td-body">
            <ErrorNote message={error} onDismiss={() => setError(null)} />
            <CategoryEditor groups={groups} saving={busy}
              initial={txn.category_group ? { group: txn.category_group, category: txn.category || null } : null}
              onSave={(v) => void write(() => setCategory(txn.id, v.group, v.category), "Category updated")} />
          </div>
        </>
      )}
      {panel === "merchant" && (
        <>
          <PanelHeader title={merchant} onBack={back} backLabel="Back to transaction" />
          <div className="td-body">
            <ErrorNote message={error} onDismiss={() => setError(null)} />
            <TextEditor label="Rename merchant" field="Merchant name" max={120} saving={busy}
              initial={txn.merchant_name || ""} placeholder={txn.description || ""}
              hint={`From your bank: ${txn.description || "no name"}. Leave empty to use it.`}
              onReset={() => void write(() => patchMeta(txn.id, { merchant_name: null }), "Merchant name reset")}
              onSave={(v) => void write(() => patchMeta(txn.id, { merchant_name: v || null }), "Merchant renamed")} />
          </div>
        </>
      )}
      {panel === "note" && (
        <>
          <PanelHeader title={merchant} onBack={back} backLabel="Back to transaction" />
          <div className="td-body">
            <ErrorNote message={error} onDismiss={() => setError(null)} />
            <TextEditor label={txn.note ? "Edit note" : "Add note"} field="Note" max={500} multiline saving={busy}
              initial={txn.note || ""} placeholder="e.g. Shared with Sam, claim on tax"
              onReset={txn.note ? () => void write(() => patchMeta(txn.id, { note: null }), "Note removed") : undefined}
              onSave={(v) => void write(() => patchMeta(txn.id, { note: v || null }), "Note saved")} />
          </div>
        </>
      )}
      {panel === "split" && (
        <SplitPanel txn={txn} title={merchant} groups={groups} onBack={back}
          onSaved={(msg) => void write(async () => {}, msg)} />
      )}
      {panel === "edit" && (
        <EditFlow rows={[txn as EditableRow]} groups={groups} tags={tags || []} onBack={back}
          onTagCreated={(t) => setTagList((l) => [...(l || []), t])}
          onApplied={(count, undo) => {
            void write(async () => {}).then(() => setToast({
              text: "Transaction updated",
              sub: `Updated ${count} transaction${count === 1 ? "" : "s"}.`,
              onUndo: () => { setToast(null); void write(undo, "Changes undone"); },
            }));
          }} />
      )}
    </DrawerShell>
  );
}

function DetailPanel({ txn, merchant, tags, tagsError, busy, error, onDismissError, onOpen, onToggleHidden, onToggleReviewed, onSaveTags, onTagCreated }: {
  txn: TxnDetail; merchant: string; tags: Tag[] | null; tagsError: string | null; busy: boolean; error: string | null;
  onDismissError: () => void; onOpen: (p: Panel) => void; onToggleHidden: (v: boolean) => void; onToggleReviewed: () => void;
  onSaveTags: (ids: string[]) => Promise<boolean>; onTagCreated: (t: Tag) => void;
}) {
  const amount = Number(txn.amount) || 0;
  const Icon = iconForGroup(txn.category_group);
  const [tagOpen, setTagOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(txn.tags.map((t) => t.id));
  const [creating, setCreating] = useState(false);
  useEffect(() => { setSel(txn.tags.map((t) => t.id)); }, [txn.tags]);
  const split = txn.splits.length >= 2;

  return (
    <>
      <PanelHeader title={merchant}
        right={(
          <button type="button" className="td-iconbtn" onClick={() => onOpen("edit")} aria-label="Edit transaction">
            <Pencil aria-hidden />
          </button>
        )} />
      <div className="td-body">
        <ErrorNote message={error} onDismiss={onDismissError} />
        <div className="td-hero">
          <p className="td-amount mh-amount" data-in={amount > 0}>{amount > 0 ? signedCents(amount) : audCents(Math.abs(amount))}</p>
          <button type="button" className="td-cat-chip" onClick={() => onOpen("category")}
            aria-label={`Category: ${txn.category_group || "Uncategorised"}. Change category`}>
            <span className="td-cat-icon" aria-hidden><Icon /></span>
            {txn.category_group || "Uncategorised"}{txn.category ? ` · ${txn.category}` : ""}
            <ChevronDown aria-hidden />
          </button>
          {txn.category_source === "auto" && <p className="td-muted td-small m-0">Category suggested automatically</p>}
          {txn.hidden && <p className="td-hidden-note"><EyeOff aria-hidden /> Not counted in your spending</p>}
        </div>

        <div className="td-card">
          <div className="td-row td-row-static">
            <span className="td-row-label">Date</span>
            <span className="td-row-value">{longDate(txn.post_date) || "Unknown"}</span>
          </div>
          <button type="button" className="td-row" onClick={() => onOpen("merchant")}>
            <span className="td-row-label">Merchant</span>
            <span className="td-row-value">{merchant}<ChevronRight className="td-chev" aria-hidden /></span>
          </button>
          <button type="button" className="td-row" aria-expanded={tagOpen} onClick={() => setTagOpen((o) => !o)}>
            <span className="td-row-label">Tag</span>
            <span className="td-row-value td-row-tags">
              {txn.tags.map((t) => <TagChip key={t.id} name={t.name} color={t.color} />)}
              <ChevronRight className="td-chev" data-open={tagOpen} aria-hidden />
            </span>
          </button>
          {tagOpen && (
            <div className="td-tag-pop">
              {tagsError ? <ErrorNote message={tagsError} /> : tags === null ? <div className="mh-skel" style={{ height: 96 }} /> : (
                <TagList tags={tags} selected={sel} onCreate={() => setCreating(true)}
                  emptyHint="No tags yet. Create one to group transactions like work trips or tax deductions."
                  onToggle={(tid) => setSel((s) => s.includes(tid) ? s.filter((x) => x !== tid) : [...s, tid])} />
              )}
              <div className="td-actions td-actions-split">
                {tags && tags.length > 0
                  ? <button type="button" className="td-btn-sm" onClick={() => setCreating(true)}>Create</button>
                  : <span />}
                <button type="button" className="td-btn-sm td-btn-ink" disabled={busy || !!tagsError || tags === null}
                  onClick={() => void onSaveTags(sel).then((ok) => ok && setTagOpen(false))}>
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
          <div className="td-row td-row-static">
            <span className="td-row-label">Hide transaction</span>
            <Switch checked={txn.hidden} onChange={onToggleHidden} disabled={busy} label="Hide this transaction from spending" />
          </div>
          <button type="button" className="td-row" onClick={() => onOpen("split")}>
            <span className="td-row-label td-row-stack">
              Split transaction
              {split && <span className="td-row-sub">{audCents(Math.abs(amount))} split into {txn.splits.length}</span>}
            </span>
            <span className="td-row-value">{split ? <Pencil className="td-chev" aria-hidden /> : <ChevronRight className="td-chev" aria-hidden />}</span>
          </button>
          {split && (
            <ul className="td-split-list">
              {txn.splits.map((s, i) => {
                const SIcon = iconForGroup(s.category_group);
                return (
                  <li key={s.id || i} data-hidden={s.hidden}>
                    <span className="td-cat-icon td-cat-icon-sm" aria-hidden><SIcon /></span>
                    <span className="td-split-cat">{s.category_group}{s.hidden && <EyeOff aria-label="Hidden" role="img" />}</span>
                    <span className="mh-amount">{audCents(Number(s.amount))}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" className="td-row" onClick={() => onOpen("note")}>
            <span className="td-row-label td-row-stack">
              {txn.note ? "Note" : "Add note"}
              {txn.note && <span className="td-row-sub td-note">{txn.note}</span>}
            </span>
            <span className="td-row-value"><ChevronRight className="td-chev" aria-hidden /></span>
          </button>
        </div>

        <div className="td-card">
          <div className="td-row td-row-static">
            <span className="td-row-label td-row-stack">
              Review status
              <span className="td-row-sub">{txn.reviewed ? <><CircleCheck aria-hidden className="td-inline-icon td-good" />Reviewed</> : "Not reviewed yet"}</span>
            </span>
            <button type="button" className="td-btn-sm" onClick={onToggleReviewed} disabled={busy}>
              {txn.reviewed ? "Mark as unreviewed" : "Mark as reviewed"}
            </button>
          </div>
        </div>

        <div className="td-source">
          {txn.institution_name ? (
            <p className="td-source-acct"><InstitutionLogo name={txn.institution_name} size={22} />{txn.institution_name}
              {txn.account_reference ? <span className="td-muted"> ({String(txn.account_reference).slice(-4)})</span> : null}</p>
          ) : txn.account_reference ? (
            <p className="td-source-acct td-muted">Account ending {String(txn.account_reference).slice(-4)}</p>
          ) : (
            <p className="td-source-acct td-muted">Added manually</p>
          )}
          {txn.description && <p className="td-muted td-small m-0">{txn.description_override || txn.description}</p>}
          {txn.status && txn.status !== "posted" && <p className="td-muted td-small m-0">Status: {txn.status}</p>}
        </div>
      </div>
      <CreateTagDialog open={creating} existing={tags || []} onClose={() => setCreating(false)}
        onCreated={(t) => { onTagCreated(t); setSel((s) => [...s, t.id]); setCreating(false); }} />
    </>
  );
}

/**
 * Bulk "Editing N transactions" drawer for list pages that support multi-select
 * (HEL-97). Pass the selected rows from GET /api/v1/transactions.
 */
export function TransactionEditDrawer({ rows, onClose, onChanged }: { rows: EditableRow[]; onClose: () => void; onChanged?: () => void }) {
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [tags, setTagList] = useState<Tag[]>([]);
  const [toast, setToast] = useToast();
  const [done, setDone] = useState(false);
  useEffect(() => {
    getCategoryGroups().then(setGroups).catch(() => setGroups([]));
    listTags().then(setTagList).catch(() => setTagList([]));
  }, []);
  return (
    <DrawerShell onClose={onClose} label="Edit transactions">
      <Toast toast={toast} onClose={() => setToast(null)} />
      {done ? (
        <>
          <PanelHeader title="Transactions updated" />
          <div className="td-body"><p className="td-muted m-0">Your changes are saved.</p>
            <div className="td-actions"><button type="button" className="td-btn-sm td-btn-ink" onClick={onClose}>Done</button></div></div>
        </>
      ) : (
        <EditFlow rows={rows} groups={groups} tags={tags} onTagCreated={(t) => setTagList((l) => [...l, t])}
          onApplied={(count, undo) => {
            onChanged?.();
            setDone(true);
            setToast({
              text: "Transactions updated", sub: `Updated ${count} transaction${count === 1 ? "" : "s"}.`,
              onUndo: () => { setToast(null); void undo().then(() => { onChanged?.(); setToast({ text: "Changes undone" }); }).catch((e: Error) => setToast({ text: e.message })); },
            });
          }} />
      )}
    </DrawerShell>
  );
}
