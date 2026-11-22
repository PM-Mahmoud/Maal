import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, CircleCheck, PieChart, Sparkles, X } from "lucide-react";
import { potentialSavings, type Suggestion, type SuggestFact } from "../../../../../../shared/spending-breakdown.mjs";
import { aud } from "@/components/maal/home/format";
import { saveBudget } from "../settings/api";
import { getBudgetSuggestion, type SuggestionResponse } from "./api";
import { ErrorLine, monthLabel } from "./parts";

type Step = "intro" | "loading" | "thin" | "error" | "gathered" | "suggested" | "finalise" | "done" | "categories";

/**
 * Creating a budget with Maal (HEL-86). Full-screen flow:
 * intro → (looking at your money) → what we found → suggested budget →
 * fine-tune with a slider → budget set → optional category budgets.
 * Every figure comes from GET /api/v1/budgets/suggestion, worked out by
 * shared/spending-breakdown.mjs. The model only adds the "What this means" and
 * "Why" wording when a key and plan allow; without it the page shows the
 * rule-based explanation instead.
 */
export function AiBudgetBuilder({ onClose, onManual, onSaved }: {
  onClose: () => void;
  onManual: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [step, setStep] = useState<Step>("intro");
  const [data, setData] = useState<SuggestionResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [value, setValue] = useState(0);
  const [cats, setCats] = useState<Array<{ group: string; budget: string; on: boolean }>>([]);
  const [busy, setBusy] = useState(false);
  const history = useRef<Step[]>([]);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  function go(next: Step) { history.current.push(step); setStep(next); }
  function back() {
    const prev = history.current.pop();
    if (prev && prev !== "loading") setStep(prev); else setStep("intro");
  }

  async function generate() {
    go("loading"); setErr(null);
    try {
      const r = await getBudgetSuggestion();
      setData(r);
      if (!r.suggestion.enoughData) { setStep("thin"); return; }
      setValue(r.suggestion.suggested);
      setCats(r.suggestion.categories.map((c) => ({ group: c.group, budget: String(c.budget), on: true })));
      setStep("gathered");
    } catch (e) { setErr((e as Error).message); setStep("error"); }
  }

  async function setBudget() {
    setBusy(true); setErr(null);
    try { await saveBudget({ category_group: null, monthly_amount: value }); await onSaved(); go("done"); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  async function saveCats() {
    setBusy(true); setErr(null);
    try {
      for (const c of cats.filter((x) => x.on)) await saveBudget({ category_group: c.group, monthly_amount: c.budget });
      await onSaved();
      onClose();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  const s = data?.suggestion;
  const wording = data?.wording;
  const canBack = !["intro", "loading", "done"].includes(step);

  return (
    <div className="mh-shell bd-ai" role="dialog" aria-modal="true" aria-label="Create a budget with Maal">
      <header className="bd-ai-head">
        {canBack ? <button type="button" className="mh-btn-outline" onClick={back}><ArrowLeft aria-hidden /> Back</button> : <span />}
        <span className="bd-ai-brand">Maal</span>
        <button type="button" className="mh-btn-outline" onClick={onClose}>Close <X aria-hidden /></button>
      </header>
      <main className="bd-ai-stage">
        <div className="bd-ai-card" data-step={step}>
          {step === "intro" && (
            <div className="bd-ai-center">
              <PieChart aria-hidden className="bd-ai-mark" />
              <h1 ref={titleRef} tabIndex={-1} className="bd-ai-title">Let’s build your budget</h1>
              <p className="bd-ai-lede">Maal looks at what came in and went out over your last three months and suggests a monthly budget you can fine-tune.</p>
              <div className="bd-ai-actions">
                <button type="button" className="bd-ai-primary" onClick={generate}><Sparkles aria-hidden /> Suggest a budget for me</button>
                <button type="button" className="bd-ai-secondary" onClick={onManual}>Set my budget myself</button>
              </div>
            </div>
          )}

          {step === "loading" && (
            <div className="bd-ai-center" aria-busy="true">
              <span className="bd-ai-spinner" aria-hidden />
              <h1 ref={titleRef} tabIndex={-1} className="bd-ai-sub">Looking at your last three months…</h1>
            </div>
          )}

          {step === "error" && (
            <div className="bd-ai-center">
              <h1 ref={titleRef} tabIndex={-1} className="bd-ai-title">That didn’t work</h1>
              <p className="bd-ai-lede">{err || "Maal couldn’t work out a budget right now."}</p>
              <div className="bd-ai-actions">
                <button type="button" className="bd-ai-primary" onClick={generate}>Try again</button>
                <button type="button" className="bd-ai-secondary" onClick={onManual}>Set my budget myself</button>
              </div>
            </div>
          )}

          {step === "thin" && (
            <div className="bd-ai-center">
              <div className="bd-ai-dialog">
                <h1 ref={titleRef} tabIndex={-1} className="bd-ai-title bd-ai-title--sm">We need a bit more history</h1>
                <p>A suggested budget works best with a few months of your spending. {s && s.monthsUsed > 0 ? `So far Maal can see ${s.spendCount} purchase${s.spendCount === 1 ? "" : "s"} across ${s.monthsUsed} full month${s.monthsUsed === 1 ? "" : "s"}.` : "Maal can’t see a full month of spending yet."}</p>
                <p>Connect the accounts you spend from, or set a budget yourself for now.</p>
                <div className="bd-ai-actions bd-ai-actions--row">
                  <Link to="/app/accounts/connect" className="mh-btn-ink">Connect accounts</Link>
                  <button type="button" className="mh-btn-outline" onClick={onManual}>Continue without connecting</button>
                </div>
              </div>
            </div>
          )}

          {step === "gathered" && s && (
            <div className="bd-ai-flow">
              <h1 ref={titleRef} tabIndex={-1} className="bd-ai-title">Here’s what we found</h1>
              <p className="bd-ai-lede">We looked at your income and spending from {monthsSpan(s)}.</p>
              <dl className="bd-ai-stats">
                <div><dt>Average income</dt><dd className="mh-amount">{aud(s.avgIncome)}</dd></div>
                <div className="bd-ai-stat-hi"><dt>{s.avgSavings < 0 ? "Average shortfall" : "Average saved"}</dt><dd className="mh-amount">{s.avgSavings < 0 ? `−${aud(-s.avgSavings)}` : aud(s.avgSavings)}</dd></div>
                <div><dt>Average spending</dt><dd className="mh-amount">{aud(s.avgExpenses)}</dd></div>
              </dl>
              {s.facts.length > 0 && (
                <>
                  <p className="bd-ai-eyebrow">What we noticed</p>
                  <ul className="bd-ai-facts">
                    {s.facts.map((f) => <li key={f.id}><b>{factTitle(f)}</b><span>{factText(f)}</span></li>)}
                  </ul>
                </>
              )}
              {wording?.summary && (
                <div className="bd-ai-box">
                  <p className="bd-ai-eyebrow">What this means</p>
                  <p>{wording.summary}</p>
                </div>
              )}
              <button type="button" className="bd-ai-primary" onClick={() => go("suggested")}>Continue</button>
            </div>
          )}

          {step === "suggested" && s && (
            <div className="bd-ai-flow">
              <h1 ref={titleRef} tabIndex={-1} className="bd-ai-title">Your suggested monthly budget</h1>
              <p className="bd-ai-big mh-amount">{aud(s.suggested)}</p>
              <MonthsChart s={s} />
              <div className="bd-ai-box">
                <p className="bd-ai-eyebrow">Why {aud(s.suggested)}?</p>
                <ul className="bd-ai-why">
                  {(wording?.why?.length ? wording.why : ruleWhy(s)).map((w) => <li key={w}>{w}</li>)}
                </ul>
              </div>
              {data?.wording_status === "plan" && <p className="bd-ai-note">Maal’s written explanation is part of membership. The numbers above are the same either way.</p>}
              <button type="button" className="bd-ai-primary" onClick={() => go("finalise")}>Continue</button>
            </div>
          )}

          {step === "finalise" && s && (
            <div className="bd-ai-flow">
              <h1 ref={titleRef} tabIndex={-1} className="bd-ai-title">Fine-tune your budget</h1>
              <p className="bd-ai-lede">{s.avgIncome > 0 ? `Based on your average income of ${aud(s.avgIncome)}, here’s a range to aim for.` : "Here’s a range to aim for, based on what you usually spend."}</p>
              <Slider s={s} value={value} onChange={setValue} />
              <Savings s={s} value={value} />
              {err && <ErrorLine>{err}</ErrorLine>}
              <button type="button" className="bd-ai-primary" onClick={setBudget} disabled={busy}>{busy ? "Saving…" : "Set budget"}</button>
            </div>
          )}

          {step === "done" && (
            <div className="bd-ai-center">
              <CircleCheck aria-hidden className="bd-ai-mark" />
              <h1 ref={titleRef} tabIndex={-1} className="bd-ai-title">Your budget is set at {aud(value)}</h1>
              <p className="bd-ai-lede">Add category budgets to keep the big ones in check.</p>
              <div className="bd-ai-actions">
                <button type="button" className="bd-ai-primary" onClick={() => go("categories")}>Set category budgets</button>
                <button type="button" className="bd-ai-secondary" onClick={onClose}>Not now</button>
              </div>
            </div>
          )}

          {step === "categories" && (
            <div className="bd-ai-flow">
              <h1 ref={titleRef} tabIndex={-1} className="bd-ai-title">Set up category budgets</h1>
              <p className="bd-ai-lede">We’ve started you off with your biggest categories, scaled to fit your budget. Change them any time.</p>
              {cats.length === 0 ? (
                <p className="bd-ai-note">No category suggestions yet. Once more of your spending is categorised, Maal can suggest some.</p>
              ) : (
                <ul className="bd-ai-cats">
                  {cats.map((c, i) => (
                    <li key={c.group}>
                      <button type="button" className="bd-ai-check" aria-pressed={c.on} aria-label={`Include ${c.group}`}
                        onClick={() => setCats((l) => l.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}>{c.on && <Check aria-hidden />}</button>
                      <span className="flex-1 min-w-0">
                        <span className="bd-trunc">{c.group}</span>
                        <span className="bd-ai-catsub">usually <span className="mh-amount">{aud(s?.categories[i]?.average ?? 0)}</span> a month</span>
                      </span>
                      <span className="bd-ai-money">$<input inputMode="decimal" value={c.budget} disabled={!c.on} aria-label={`${c.group} monthly budget`}
                        onChange={(e) => setCats((l) => l.map((x, j) => (j === i ? { ...x, budget: e.target.value } : x)))} /></span>
                    </li>
                  ))}
                </ul>
              )}
              {err && <ErrorLine>{err}</ErrorLine>}
              <div className="bd-ai-actions">
                <button type="button" className="bd-ai-primary" disabled={busy || !cats.some((c) => c.on && Number(c.budget) > 0)} onClick={saveCats}>{busy ? "Saving…" : "Set category budgets"}</button>
                <button type="button" className="bd-ai-secondary" onClick={onClose}>Not now</button>
              </div>
            </div>
          )}
        </div>
      </main>
      <footer className="bd-ai-foot">Maal does not provide financial advice. Suggestions are for educational purposes only and are worked out from your own transactions.</footer>
    </div>
  );
}

function monthsSpan(s: Suggestion) {
  const a = s.months[0];
  const b = s.months[s.months.length - 1];
  if (!a) return "recent months";
  return a.key === b.key ? monthLabel(a.year, a.month) : `${monthLabel(a.year, a.month)} to ${monthLabel(b.year, b.month)}`;
}

function factTitle(f: SuggestFact) {
  switch (f.id) {
    case "no_income": return "No income recorded";
    case "negative_cash_flow": return "Spending more than you earn";
    case "saving": return "You’re putting money aside";
    case "top_category": return `${f.category} is your biggest category`;
    case "uncategorised": return "A lot sits in Other";
  }
}
function factText(f: SuggestFact) {
  switch (f.id) {
    case "no_income": return `Maal didn’t see any income in your connected accounts over ${f.months} month${f.months === 1 ? "" : "s"}. If your pay lands in another account, connecting it gives a truer picture.`;
    case "negative_cash_flow": return `In ${f.negativeMonths} of ${f.months} months more went out than came in, about ${aud(f.shortfall)} a month on average.`;
    case "saving": return `On average ${aud(f.savings)} a month stayed unspent, about ${Math.round(f.rate)}% of your income.`;
    case "top_category": return `About ${aud(f.average)} a month, or ${Math.round(f.share)}% of your spending.`;
    case "uncategorised": return `About ${aud(f.average)} a month (${Math.round(f.share)}%) isn’t categorised, which makes it harder to see where to save.`;
  }
}
/** The arithmetic behind the suggestion, in words (used when there's no model wording). */
function ruleWhy(s: Suggestion): string[] {
  const out = [`You usually spend about ${aud(s.avgExpenses)} a month.`];
  // Same test as suggestBudget(): spending at or under 80% of income stays put.
  if (s.avgIncome > 0 && s.avgIncome * 0.8 >= s.avgExpenses) out.push(`That already leaves at least 20% of your ${aud(s.avgIncome)} income unspent, so the budget keeps your spending where it is.`);
  else if (s.avgIncome > 0) out.push(`Maal aims for spending at about 80% of your income, without asking you to cut more than 15% in one go.`);
  else out.push("With no income to compare against, Maal suggests trimming your usual spending by up to 15%.");
  out.push(`Anywhere between ${aud(s.range.min)} and ${aud(s.range.max)} is a sensible place to start.`);
  return out;
}

/** Spending per month reviewed, with the suggested budget as a dashed line. */
function MonthsChart({ s }: { s: Suggestion }) {
  const max = Math.max(s.suggested, ...s.months.map((m) => m.expenses), 1) * 1.15;
  const y = (v: number) => 100 - (v / max) * 100;
  return (
    <div className="bd-ai-chart" role="img" aria-label={`Monthly spending: ${s.months.map((m) => `${monthLabel(m.year, m.month, "short")} ${aud(m.expenses)}`).join(", ")}. Suggested budget ${aud(s.suggested)}.`}>
      <div className="bd-ai-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {s.months.map((m, i) => {
            const w = 100 / s.months.length;
            const h = 100 - y(m.expenses);
            return <rect key={m.key} x={i * w + w * 0.38} y={y(m.expenses)} width={w * 0.24} height={h} className="bd-ai-bar" />;
          })}
          <line x1="0" x2="100" y1={y(s.suggested)} y2={y(s.suggested)} className="bd-ai-line" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="bd-ai-linetag mh-amount" style={{ top: `${y(s.suggested)}%` }}>{aud(s.suggested)}</span>
      </div>
      <div className="bd-ai-x">{s.months.map((m) => <span key={m.key}>{new Date(m.year, m.month).toLocaleDateString("en-AU", { month: "short" })}</span>)}</div>
    </div>
  );
}

function Slider({ s, value, onChange }: { s: Suggestion; value: number; onChange: (v: number) => void }) {
  const { min, max, step } = s.slider;
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  const inRange = value >= s.range.min && value <= s.range.max;
  return (
    <div className="bd-ai-slider" data-tone={inRange ? "good" : "warn"}>
      <p className="bd-ai-eyebrow">Monthly budget</p>
      <p className="bd-ai-sval mh-amount">{aud(value)}</p>
      <div className="bd-ai-srow">
        <button type="button" className="bd-ai-round" onClick={() => onChange(clamp(value - step))} aria-label={`Lower by ${aud(step)}`}><ChevronLeft aria-hidden /></button>
        <div className="bd-ai-track">
          <span className="bd-ai-band" style={{ left: `${pos(s.range.min)}%`, width: `${pos(s.range.max) - pos(s.range.min)}%` }} aria-hidden />
          <span className="bd-ai-tick" style={{ left: `${pos(s.suggested)}%` }} aria-hidden />
          <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
            aria-label="Monthly budget" aria-valuetext={aud(value)} />
        </div>
        <button type="button" className="bd-ai-round" onClick={() => onChange(clamp(value + step))} aria-label={`Raise by ${aud(step)}`}><ChevronRight aria-hidden /></button>
      </div>
      <p className="bd-ai-range">Stay within <span className="mh-amount">{aud(s.range.min)}</span> to <span className="mh-amount">{aud(s.range.max)}</span> to stay on track. Suggested: <span className="mh-amount">{aud(s.suggested)}</span>.</p>
    </div>
  );
}

function Savings({ s, value }: { s: Suggestion; value: number }) {
  const p = potentialSavings(value, s.avgIncome, s.avgExpenses);
  return (
    <div className="bd-ai-save" data-tone={p.tone} aria-live="polite">
      <p className="bd-ai-eyebrow">Your potential savings</p>
      {p.monthlySaving !== null && (p.overIncome > 0
        ? <p>This budget is <b className="mh-amount">{aud(p.overIncome)}</b> a month more than your income, so you’d be dipping into savings or credit.</p>
        : <p>You could put aside about <b className="mh-amount">{aud(p.monthlySaving)}</b> a month.</p>)}
      <p>{p.vsTypical >= 0
        ? <>That’s <b className="mh-amount">{aud(p.vsTypical)}</b> less than your usual <b className="mh-amount">{aud(s.avgExpenses)}</b> of spending.</>
        : <>That’s <b className="mh-amount">{aud(-p.vsTypical)}</b> more than your usual <b className="mh-amount">{aud(s.avgExpenses)}</b> of spending.</>}</p>
    </div>
  );
}
