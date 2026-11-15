// Risk assessment dialog — Figma frames 03 (introduction), 04–06 (questions,
// "Tell us about you") and 07 (complete). Questions come from the server
// (lib/risk-profile.js); the band is scored server-side on submit.
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Artwork, DISCLAIMER, Dialog, InfoLine } from "./ui";
import { submitRiskProfile, type RiskQuestionnaire, type RiskResult } from "./api";
import { RiskMeter } from "./RiskMeter";

type Phase = { kind: "intro" } | { kind: "step"; index: number } | { kind: "complete"; result: RiskResult };

export function RiskAssessmentDialog({ questionnaire, initialAnswers, onClose, onSaved }: {
  questionnaire: RiskQuestionnaire;
  initialAnswers: Record<string, string>;
  onClose: () => void;
  onSaved: (r: RiskResult) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const steps = questionnaire.steps;
  const total = steps.length;
  const qById = Object.fromEntries(questionnaire.questions.map((q) => [q.id, q]));

  // Move focus to the new heading whenever the screen changes (screen readers
  // announce the next question; keyboard users start at the top).
  const phaseKey = phase.kind === "step" ? `step-${phase.index}` : phase.kind;
  useEffect(() => { if (phase.kind !== "intro") headingRef.current?.focus(); }, [phaseKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (id: string, value: string) => setAnswers((a) => ({ ...a, [id]: value }));

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const result = await submitRiskProfile(answers);
      onSaved(result);
      setPhase({ kind: "complete", result });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your risk profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (phase.kind === "intro") {
    return (
      <Dialog kicker="Risk assessment" labelledBy="mst-risk-title" onClose={onClose}
        footer={<>
          <button type="button" className="mst-btn mst-btn-line" onClick={onClose}>Close</button>
          <button type="button" className="mst-btn mst-btn-ink" data-autofocus onClick={() => setPhase({ kind: "step", index: 0 })}>Next</button>
        </>}>
        <div className="mst-dialog-center">
          <Artwork />
          <h2 id="mst-risk-title" style={{ marginTop: 18 }}>Let’s work out your risk profile</h2>
          <p className="mst-lede">
            {total} quick questions about your goals, timeframe and how you feel about ups and downs. It takes about two minutes,
            and Maal uses the result to tailor the examples and explanations you see.
          </p>
        </div>
      </Dialog>
    );
  }

  if (phase.kind === "complete") {
    const r = phase.result;
    return (
      <Dialog kicker="Risk assessment" labelledBy="mst-risk-title" onClose={onClose}
        footer={<button type="button" className="mst-btn mst-btn-ink" onClick={onClose}>Done</button>}>
        <div className="mst-dialog-center">
          <Artwork small />
          <h2 id="mst-risk-title" ref={headingRef} tabIndex={-1} style={{ marginTop: 14, outline: "none" }}>Complete</h2>
          <p className="mst-lede">You’ve finished the questionnaire. Your risk profile is now set to <strong>{r.label}</strong>.</p>
        </div>
        <div className="mst-result" style={{ marginTop: 20 }}>
          <p><strong>{r.label}:</strong> {r.summary}</p>
          <RiskMeter band={r.profile} />
          <p className="mst-muted" style={{ marginTop: 6 }}>{r.detail}</p>
        </div>
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <InfoLine>
            This describes how you answered — it isn’t a recommendation to buy, sell or switch anything, including your super
            investment option. You can see an example mix for this profile on the <Link to="/app/portfolio-plan" onClick={onClose}>Portfolio plan</Link> page.
          </InfoLine>
          <p className="mst-disclaimer">{DISCLAIMER}</p>
        </div>
      </Dialog>
    );
  }

  const index = phase.index;
  const step = steps[index];
  const stepQuestions = step.questions.map((id) => qById[id]).filter(Boolean);
  const complete = stepQuestions.every((q) => !!answers[q.id]);
  const isLast = index === total - 1;
  const back = () => setPhase(index === 0 ? { kind: "intro" } : { kind: "step", index: index - 1 });
  const next = () => { if (!complete) return; if (isLast) void finish(); else setPhase({ kind: "step", index: index + 1 }); };

  return (
    <Dialog kicker={`Risk assessment — Question ${index + 1} of ${total}`} labelledBy="mst-risk-title" onClose={onClose}
      progress={(index + 1) / total}
      footer={<>
        <button type="button" className="mst-btn mst-btn-line" onClick={back} disabled={saving}>Back</button>
        <button type="button" className="mst-btn mst-btn-ink" onClick={next} disabled={!complete || saving}>
          {saving ? "Saving…" : isLast ? "See my profile" : "Next"}
        </button>
      </>}>
      <form onSubmit={(e) => { e.preventDefault(); next(); }}>
        <h2 id="mst-risk-title" ref={headingRef} tabIndex={-1} style={{ outline: "none" }}>{step.title}</h2>
        {step.id === "about" ? (
          <div style={{ marginTop: 22 }}>
            {stepQuestions.map((q) => (
              <label key={q.id} className="mst-input has-chevron">
                <span>{q.title}</span>
                <select value={answers[q.id] ?? ""} onChange={(e) => set(q.id, e.target.value)} required>
                  <option value="" disabled>Choose one</option>
                  {q.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            ))}
            <p className="mst-info" style={{ marginTop: 14 }}>Your age matters because it shapes how long your money has to recover from a fall — for most people, super can’t be accessed until preservation age.</p>
          </div>
        ) : (
          stepQuestions.map((q) => (
            <fieldset key={q.id} className="mst-options">
              <legend className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{q.title}</legend>
              {q.options.map((o) => {
                const on = answers[q.id] === o.value;
                return (
                  <label key={o.value} className={`mst-option${on ? " is-on" : ""}`}>
                    <input type="radio" name={q.id} value={o.value} checked={on} onChange={() => set(q.id, o.value)} />
                    <span className="mst-radio" aria-hidden="true" />
                    <span>{o.label}</span>
                  </label>
                );
              })}
            </fieldset>
          ))
        )}
        {error && <p className="mst-alert" role="alert" style={{ marginTop: 16 }}>{error}</p>}
      </form>
    </Dialog>
  );
}
