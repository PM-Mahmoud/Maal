import { useId, useMemo, useState } from "react";
import { CalendarDays, Minus, Plus } from "lucide-react";
import {
  MAX_SPLITS, equalSplit, remainingCents, validateSplits,
} from "../../../../../../shared/transaction-splits.mjs";
import { audCents } from "@/components/maal/home/format";
import { iconForGroup } from "../overview/categoryIcons";
import { catVars } from "../categoryColour";
import { putSplits, removeSplits, type CategoryGroup, type TxnDetail } from "./api";
import { ErrorNote, PanelHeader, Switch, longDate } from "./ui";

type Part = { category_group: string; category: string | null; amount: string; hidden: boolean };
type Mode = "equal" | "custom";

const fmt = (n: number) => n.toFixed(2);

/**
 * Split transaction (HEL-101): divide one transaction into parts with their
 * own category and visibility. Equal mode shares the amount evenly (cents
 * handled exactly); custom mode lets you type each part. Apply is only enabled
 * once the parts add up to the total (shared/transaction-splits.mjs, which the
 * server re-checks).
 */
export function SplitPanel({ txn, title, groups, onBack, onSaved }: {
  txn: TxnDetail; title: string; groups: CategoryGroup[]; onBack: () => void; onSaved: (msg: string) => void;
}) {
  const total = Math.abs(Number(txn.amount) || 0);
  const existing = txn.splits && txn.splits.length >= 2;
  const [mode, setMode] = useState<Mode>(existing ? "custom" : "equal");
  const [parts, setParts] = useState<Part[]>(() => existing
    ? txn.splits.map((s) => ({ category_group: s.category_group, category: s.category, amount: fmt(Number(s.amount)), hidden: !!s.hidden }))
    : [{ category_group: txn.category_group || "Other", category: txn.category || null, amount: fmt(total), hidden: false }]);
  const [touched, setTouched] = useState<boolean[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modeId = useId();

  const withEqual = (list: Part[]) => {
    const amounts = equalSplit(total, list.length);
    return list.map((p, i) => ({ ...p, amount: fmt(amounts[i] ?? 0) }));
  };

  function changeMode(m: Mode) {
    setMode(m);
    if (m === "equal") setParts((list) => withEqual(list));
  }

  function addPart() {
    if (parts.length >= MAX_SPLITS) return;
    const base: Part = { category_group: txn.category_group || "Other", category: null, amount: "", hidden: false };
    if (mode === "equal") { setParts(withEqual([...parts, base])); return; }
    const left = remainingCents(total, parts);
    setParts([...parts, { ...base, amount: left > 0 ? fmt(left / 100) : "" }]);
  }

  function removePart(i: number) {
    const next = parts.filter((_, k) => k !== i);
    setParts(mode === "equal" ? withEqual(next) : next);
    setTouched((t) => t.filter((_, k) => k !== i));
  }

  const update = (i: number, patch: Partial<Part>) => setParts((list) => list.map((p, k) => k === i ? { ...p, ...patch } : p));

  const check = useMemo(() => validateSplits(total, parts), [total, parts]);
  const left = remainingCents(total, parts);

  async function apply() {
    if (!check.ok) return;
    setSaving(true); setError(null);
    try {
      await putSplits(txn.id, check.parts);
      onSaved(`Split into ${check.parts.length} parts`);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!existing) { onBack(); return; }
    setSaving(true); setError(null);
    try { await removeSplits(txn.id); onSaved("Split removed"); }
    catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  const merchant = txn.merchant_name || txn.description || "Transaction";
  return (
    <>
      <PanelHeader title="Split transaction" onBack={onBack} backLabel={`Back to ${title}`} />
      <div className="td-body">
        <ErrorNote message={error} onDismiss={() => setError(null)} />
        <div className="td-card">
          <p className="td-split-name">{merchant}</p>
          <p className="td-split-meta">
            <span className="mh-amount">{audCents(total)}</span>
            <span className="td-muted"><CalendarDays aria-hidden className="td-inline-icon" />{longDate(txn.post_date)}</span>
          </p>
        </div>

        <div className="td-split-tools">
          <label className="td-select-btn">
            <span className="sr-only" id={modeId}>Split type</span>
            <select aria-labelledby={modeId} value={mode} onChange={(e) => changeMode(e.target.value as Mode)}>
              <option value="equal">Equal split</option>
              <option value="custom">Custom split</option>
            </select>
          </label>
          <button type="button" className="td-btn-line" onClick={addPart} disabled={parts.length >= MAX_SPLITS}>
            Add split <Plus aria-hidden />
          </button>
        </div>

        {parts.map((p, i) => {
          const Icon = iconForGroup(p.category_group);
          const err = touched[i] || i > 0 ? check.partErrors[i] : undefined;
          const amtId = `${modeId}-amt-${i}`;
          const catId = `${modeId}-cat-${i}`;
          return (
            <section className="td-card td-part" key={i} aria-label={`Part ${i + 1}`}>
              {i > 0 && (
                <div className="td-part-head">
                  <span className="td-muted td-small">Part {i + 1}</span>
                  <button type="button" className="td-iconbtn td-iconbtn-box" onClick={() => removePart(i)} aria-label={`Remove part ${i + 1}`}>
                    <Minus aria-hidden />
                  </button>
                </div>
              )}
              <div className="td-card-pad td-part-body">
                <label className="td-cat-select" htmlFor={catId}>
                  <span className="td-cat-icon cat-chip" style={catVars(p.category_group)} aria-hidden><Icon /></span>
                  <select id={catId} aria-label={`Category for part ${i + 1}`} value={p.category_group}
                    onChange={(e) => update(i, { category_group: e.target.value, category: null })}>
                    {groups.length === 0 && <option value={p.category_group}>{p.category_group}</option>}
                    {groups.map((g) => <option key={g.group} value={g.group}>{g.group}</option>)}
                  </select>
                </label>
                <div className="td-field" data-error={!!err}>
                  <label htmlFor={amtId} className="td-field-label">Amount</label>
                  <span className="td-money">
                    <span aria-hidden>$</span>
                    <input id={amtId} inputMode="decimal" value={p.amount} readOnly={mode === "equal"} placeholder="0.00"
                      aria-invalid={!!err} aria-describedby={err ? `${amtId}-err` : undefined}
                      onBlur={() => setTouched((t) => { const n = [...t]; n[i] = true; return n; })}
                      onChange={(e) => update(i, { amount: e.target.value })} />
                  </span>
                  {err && <span className="td-field-err" id={`${amtId}-err`}>{err}</span>}
                </div>
              </div>
              <div className="td-row td-row-static">
                <span className="td-row-label">Hide from spending</span>
                <Switch checked={p.hidden} onChange={(v) => update(i, { hidden: v })} label={`Hide part ${i + 1} from spending`} />
              </div>
            </section>
          );
        })}

        {parts.length >= 2 && !check.ok && (
          <p className="td-muted td-small m-0" aria-live="polite">
            {left === 0 ? check.error : left > 0 ? `${audCents(left / 100)} left to allocate.` : `${audCents(Math.abs(left) / 100)} over the total.`}
          </p>
        )}
        {parts.length < 2 && <p className="td-muted td-small m-0">Add a split to divide this transaction across categories.</p>}
      </div>
      <footer className="td-foot">
        <button type="button" className="td-btn-sm" onClick={() => void remove()} disabled={saving}>
          {existing ? "Remove split" : "Cancel"}
        </button>
        <button type="button" className="td-btn-sm td-btn-ink" onClick={() => void apply()} disabled={!check.ok || saving}>
          {saving ? "Saving…" : "Apply split"}
        </button>
      </footer>
    </>
  );
}
