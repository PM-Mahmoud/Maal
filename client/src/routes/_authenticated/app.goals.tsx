import { createFileRoute } from "@tanstack/react-router";

import { useEffect, useMemo, useState } from "react";
import { listGoals, upsertGoal, deleteGoal } from "@/lib/goals.functions";
import { formatAUD } from "@/lib/score";

export const Route = createFileRoute("/_authenticated/app/goals")({ component: GoalsPage });

type Goal = {
  id: string;
  name: string;
  category: string;
  target_amount: number;
  current_amount: number;
  progress_pct?: number;
  auto_tracked?: boolean;
  source_type?: string;
  target_kind?: string;
  target_pct?: number | null;
  target_date: string | null;
  description?: string | null;
};

const TABS = [
  { id: "all", label: "All Goals", cats: null as null | string[] },
  { id: "grow", label: "Grow", cats: ["retirement"] },
  { id: "save", label: "Save", cats: ["emergency", "home", "education", "travel"] },
  { id: "payoff", label: "Pay Off", cats: ["debt"] },
  { id: "invest", label: "Invest", cats: ["invest"] },
] as const;

const CATEGORY_OPTIONS = [
  { v: "emergency", l: "Emergency fund", tab: "Save" },
  { v: "home", l: "Home deposit", tab: "Save" },
  { v: "education", l: "Education", tab: "Save" },
  { v: "travel", l: "Travel", tab: "Save" },
  { v: "retirement", l: "Retirement / Super", tab: "Grow" },
  { v: "invest", l: "Investing target", tab: "Invest" },
  { v: "debt", l: "Debt payoff", tab: "Pay Off" },
  { v: "other", l: "Other", tab: "—" },
] as const;

function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);

  async function refresh() { setGoals((await listGoals()) as Goal[]); }
  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const cats = TABS.find((t) => t.id === tab)?.cats;
    return cats ? goals.filter((g) => (cats as readonly string[]).includes(g.category)) : goals;
  }, [goals, tab]);

  function openCreate() { setEditing(null); setOpen(true); }
  function openEdit(g: Goal) { setEditing(g); setOpen(true); }

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[32px] tracking-display font-bold">Goals</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Set targets and let Maal keep score — automatically.</p>
        </div>
        <button onClick={openCreate}
          className="px-4 py-2 rounded-[10px] border border-border bg-[var(--surface)] hover:border-mint/40 text-[13px] font-medium">
          + Add Goal
        </button>
      </div>

      <div className="inline-flex items-center gap-1 p-1 bg-[var(--secondary)] rounded-[10px] mb-6">
        {TABS.map((t) => {
          const active = tab === t.id;
          const count = t.cats ? goals.filter((g) => (t.cats as readonly string[]).includes(g.category)).length : goals.length;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition ${active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t.label}{count > 0 && <span className="ml-1 text-[10px] opacity-70">{count}</span>}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-[var(--surface)] py-16 px-6 text-center">
          <p className="text-[15px] font-semibold mb-2">No goals found</p>
          <p className="text-[13px] text-muted-foreground max-w-md mx-auto mb-6">
            You haven't created any financial goals yet. Set your financial goals to track your progress.
          </p>
          <button onClick={openCreate}
            className="px-4 py-2 border border-border rounded-[10px] text-[13px] font-semibold bg-background hover:border-foreground transition-colors">
            Create your first goal
          </button>
        </div>
      ) : (
        <ul className="grid md:grid-cols-2 gap-4">
          {filtered.map((g) => {
            const pct = g.progress_pct ?? (g.target_amount > 0 ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)) : 0);
            const remaining = Math.max(0, g.target_amount - g.current_amount);
            const due = g.target_date ? new Date(g.target_date) : null;
            const daysLeft = due ? Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
            return (
              <li key={g.id} className="p-5 border border-border rounded-[14px] bg-[var(--surface)]">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[14px] font-semibold">{g.name}</p>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      {categoryLabel(g.category)}
                      {g.auto_tracked && (
                        <span className="inline-flex items-center gap-1 normal-case tracking-normal text-mint">
                          <span className="w-1.5 h-1.5 rounded-full bg-mint" />{sourceLabel(g.source_type)}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{pct}%</span>
                </div>
                <p className="text-[20px] font-bold tabular-nums">{formatAUD(g.current_amount)} <span className="text-[13px] text-muted-foreground font-normal">/ {formatAUD(g.target_amount)}</span></p>
                <div className="h-1.5 bg-[var(--secondary)] rounded-full overflow-hidden mt-3">
                  <div className="h-full bg-mint" style={{ width: `${pct}%`, transition: "width 600ms ease-out" }} />
                </div>
                <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{remaining > 0 ? `${formatAUD(remaining)} to go` : "Reached"}{daysLeft !== null ? ` · ${daysLeft > 0 ? `${daysLeft}d left` : "due"}` : ""}</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => openEdit(g)} className="hover:text-foreground">Edit</button>
                    <button onClick={async () => { await deleteGoal({ id: g.id }); refresh(); }} className="hover:text-foreground">Delete</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SuggestionsPanel goals={goals} />

      <p className="mt-12 text-center text-[11px] text-muted-foreground">
        DISCLAIMER: Maal does not provide financial advice. Any information provided by Maal is for educational purposes only.
        You should do your own research. Investing is risky and you can lose all of your money.
      </p>

      {open && (
        <GoalModal
          initial={editing}
          onClose={() => setOpen(false)}
          onSave={async (payload) => {
            await upsertGoal(payload);
            setOpen(false); refresh();
          }}
        />
      )}
    </div>
  );
}

function categoryLabel(v: string) {
  return CATEGORY_OPTIONS.find((c) => c.v === v)?.l ?? v;
}

const SOURCE_OPTIONS = [
  { v: "manual", l: "Manual — I'll update it" },
  { v: "net_worth", l: "Net worth" },
  { v: "cash", l: "Total cash" },
  { v: "super", l: "Super" },
  { v: "investments", l: "Investments" },
  { v: "debts", l: "Total debts" },
] as const;

function sourceLabel(v?: string) {
  return SOURCE_OPTIONS.find((s) => s.v === v)?.l ?? "Live";
}

function SuggestionsPanel({ goals }: { goals: Goal[] }) {
  const suggestions: { title: string; body: string }[] = [];
  if (!goals.some((g) => g.category === "emergency")) {
    suggestions.push({ title: "Build a 3-month emergency fund", body: "A cash buffer covering 3 months of essentials is the foundation of every plan." });
  }
  if (!goals.some((g) => g.category === "retirement")) {
    suggestions.push({ title: "Set a super / retirement target", body: "Aim for an ASFA Comfortable retirement balance by age 67." });
  }
  if (!goals.some((g) => g.category === "debt")) {
    suggestions.push({ title: "Pay off high-interest debt", body: "Credit cards and personal loans usually beat any investment return — clear them first." });
  }

  return (
    <section className="mt-10">
      <h2 className="text-[16px] font-semibold mb-3">Suggestions</h2>
      {suggestions.length === 0 ? (
        <div className="rounded-[14px] border border-border bg-[var(--surface)] py-12 px-6 text-center">
          <p className="text-[14px] font-semibold mb-1">No Suggestions Available</p>
          <p className="text-[12px] text-muted-foreground max-w-md mx-auto">
            Connect more accounts to get personalised suggestions for your financial goals.
          </p>
        </div>
      ) : (
        <ul className="grid md:grid-cols-3 gap-3">
          {suggestions.map((s) => (
            <li key={s.title} className="p-4 rounded-[12px] border border-border bg-[var(--surface)]">
              <p className="text-[13px] font-semibold mb-1">{s.title}</p>
              <p className="text-[11px] text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const GOAL_TYPES = [
  { v: "grow", label: "Grow", categories: ["retirement", "invest"], sources: ["net_worth", "super", "investments"] },
  { v: "save", label: "Save", categories: ["emergency", "home", "education", "travel"], sources: ["cash", "net_worth"] },
  { v: "payoff", label: "Pay Off", categories: ["debt"], sources: ["debts"] },
  { v: "invest", label: "Invest", categories: ["invest"], sources: ["investments"] },
] as const;
type GoalType = typeof GOAL_TYPES[number]["v"];

function typeForCategory(cat: string): GoalType {
  if (cat === "debt") return "payoff";
  if (cat === "retirement") return "grow";
  if (cat === "invest") return "invest";
  return "save";
}

function GoalModal({ initial, onClose, onSave }: {
  initial: Goal | null;
  onClose: () => void;
  onSave: (p: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [goalType, setGoalType] = useState<GoalType>(initial ? typeForCategory(initial.category) : "grow");
  const [category, setCategory] = useState(initial?.category ?? "retirement");
  const [sourceType, setSourceType] = useState<string>(initial?.source_type ?? "net_worth");
  const [targetKind, setTargetKind] = useState<"amount" | "percent">(initial?.target_kind === "percent" ? "percent" : "amount");
  const [target, setTarget] = useState(initial?.target_amount ?? 0);
  const [targetPct, setTargetPct] = useState<number>(initial?.target_kind === "percent" && initial?.target_pct != null ? Number(initial.target_pct) : 0);
  const [current, setCurrent] = useState(initial?.current_amount ?? 0);
  const [date, setDate] = useState(initial?.target_date ?? new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const isManual = sourceType === "manual";
  const allowedSources = GOAL_TYPES.find((g) => g.v === goalType)?.sources ?? ["net_worth"];
  const sourceChoices = SOURCE_OPTIONS.filter((s) => s.v === "manual" || allowedSources.includes(s.v as never));

  // Keep category + source in sync when goal type changes.
  function changeType(t: GoalType) {
    setGoalType(t);
    const def = GOAL_TYPES.find((g) => g.v === t);
    if (def) {
      setCategory(def.categories[0]);
      if (!def.sources.includes(sourceType as never) && sourceType !== "manual") setSourceType(def.sources[0]);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await onSave({
        id: initial?.id,
        name: name.trim(),
        category,
        description: (description ?? "").trim() || null,
        source_type: sourceType,
        target_kind: isManual ? "amount" : targetKind,
        target_pct: !isManual && targetKind === "percent" ? Number(targetPct) : null,
        target_amount: targetKind === "percent" && !isManual ? 0 : Number(target),
        current_amount: isManual ? Number(current) : 0,
        target_date: date || null,
      });
    } finally { setBusy(false); }
  }

  const inputCls = "w-full px-3 py-2 border border-border rounded-[8px] text-[13px] bg-background placeholder:text-muted-foreground";
  const labelCls = "text-[12px] font-semibold block mb-1.5";

  return (
    <div role="dialog" aria-modal="true" aria-label={initial ? "Edit goal" : "Create New Goal"}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-[16px] border border-border bg-[var(--surface)] p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-[18px] font-bold tracking-display">{initial ? "Edit Goal" : "Create New Goal"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground text-[18px] leading-none">×</button>
        </div>
        <p className="text-[12px] text-muted-foreground mb-5">Set up a goal and let Maal track it against your live position.</p>

        <div className="mb-4">
          <label htmlFor="goal-name" className={labelCls}>Goal</label>
          <input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="E.g. Emergency Fund, Grow Net Worth" className={inputCls} />
        </div>

        <div className="mb-4">
          <label htmlFor="goal-description" className={labelCls}>Description (Optional)</label>
          <textarea id="goal-description" value={description ?? ""} onChange={(e) => setDescription(e.target.value)} placeholder="Add details about your goal" rows={2} className={`${inputCls} resize-none`} />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label htmlFor="goal-type" className={labelCls}>Goal Type</label>
            <select id="goal-type" value={goalType} onChange={(e) => changeType(e.target.value as GoalType)} className={inputCls}>
              {GOAL_TYPES.map((g) => <option key={g.v} value={g.v}>{g.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="goal-source" className={labelCls}>Track against</label>
            <select id="goal-source" value={sourceType} onChange={(e) => setSourceType(e.target.value)} className={inputCls}>
              {sourceChoices.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
          </div>
        </div>

        {!isManual && (
          <p className="text-[11px] text-muted-foreground mb-4 -mt-1">
            {goalType === "payoff"
              ? "Progress rises automatically as your total debts fall."
              : `Progress updates automatically from your live ${sourceLabel(sourceType).toLowerCase()}.`}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          {isManual && (
            <div>
              <label htmlFor="goal-current" className={labelCls}>Current Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[13px]">$</span>
                <input id="goal-current" type="number" min={0} value={current} onChange={(e) => setCurrent(Number(e.target.value))} className={`${inputCls} pl-7`} />
              </div>
            </div>
          )}
          <div className={isManual ? "" : "col-span-2"}>
            <label htmlFor={targetKind === "percent" && !isManual ? "goal-target-pct" : "goal-target"} className={labelCls}>Target</label>
            {!isManual && (
              <div className="inline-flex items-center gap-1 p-0.5 bg-[var(--secondary)] rounded-[8px] mb-2">
                {(["amount", "percent"] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setTargetKind(k)}
                    className={`px-2.5 py-1 rounded-[6px] text-[11px] font-medium ${targetKind === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
                    {k === "amount" ? "$ amount" : "% of source"}
                  </button>
                ))}
              </div>
            )}
            {targetKind === "percent" && !isManual ? (
              <div className="relative">
                <input id="goal-target-pct" type="number" min={0} value={targetPct} onChange={(e) => setTargetPct(Number(e.target.value))} className={`${inputCls} pr-7`} placeholder="e.g. 120" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[13px]">%</span>
              </div>
            ) : (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[13px]">$</span>
                <input id="goal-target" type="number" min={0} required value={target} onChange={(e) => setTarget(Number(e.target.value))} className={`${inputCls} pl-7`} />
              </div>
            )}
          </div>
        </div>

        <div className="mb-6">
          <label htmlFor="goal-date" className={labelCls}>Target Date</label>
          <input id="goal-date" type="date" value={date ?? ""} onChange={(e) => setDate(e.target.value)} className={`${inputCls} w-auto`} />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground">Cancel</button>
          <button type="submit" disabled={busy || !name.trim()}
            className="px-4 py-2 bg-foreground text-background rounded-[8px] text-[12px] font-semibold disabled:opacity-50">
            {busy ? "Saving…" : initial ? "Save changes" : "Create Goal"}
          </button>
        </div>
      </form>
    </div>
  );
}
