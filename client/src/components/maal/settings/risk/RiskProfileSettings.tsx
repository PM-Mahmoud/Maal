// Settings → Risk profile — Figma frames 02 (not started) and 08 (profile set).
// Card shows the current risk tolerance and opens the assessment dialog.
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Field, InfoLine, SettingsCard, formatAuDate } from "./ui";
import { fetchRiskProfile, type RiskProfileState, type RiskResult } from "./api";
import { RiskAssessmentDialog } from "./RiskAssessmentDialog";
import { RiskMeter } from "./RiskMeter";

export function RiskProfileSettings() {
  const [state, setState] = useState<RiskProfileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try { setState(await fetchRiskProfile()); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load your risk profile."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const result = state?.result ?? null;
  const onSaved = (r: RiskResult) => setState((s) => (s ? { ...s, result: r } : s));

  const initialAnswers: Record<string, string> = { ...(result?.answers ?? {}) };
  if (!initialAnswers.age_band && state?.ageBand) initialAnswers.age_band = state.ageBand;

  return (
    <div className="mst mst-page">
      <SettingsCard
        kicker="Risk profile"
        aside={result ? <span className="mst-badge">Updated {formatAuDate(result.completed_at)}</span> : null}
        foot={state ? (
          result ? (
            <button type="button" className="mst-btn mst-btn-line" onClick={() => setOpen(true)}>Update risk profile <ArrowUpRight /></button>
          ) : (
            <button type="button" className="mst-btn mst-btn-ink" onClick={() => setOpen(true)}>Start risk assessment <ArrowUpRight /></button>
          )
        ) : null}
      >
        {error ? (
          <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
            <p className="mst-alert" role="alert">{error}</p>
            <button type="button" className="mst-btn mst-btn-line" onClick={() => void load()}>Try again</button>
          </div>
        ) : !state ? (
          <div aria-busy="true" aria-label="Loading risk profile" style={{ display: "grid", gap: 10 }}>
            <div className="mst-skel" style={{ height: 62, maxWidth: 560 }} />
            <div className="mst-skel" style={{ height: 16, maxWidth: 420 }} />
          </div>
        ) : (
          <>
            <Field label="Risk tolerance" value={result ? result.label : "Not started"} set={!!result} />
            {result && (
              <div className="mst-result" style={{ maxWidth: 560 }}>
                <p><strong>{result.label}:</strong> {result.summary}</p>
                <RiskMeter band={result.profile} />
              </div>
            )}
            <InfoLine>
              Your risk profile shapes the examples Maal shows you — like the sample mix on your{" "}
              <Link to="/app/portfolio-plan">Portfolio plan</Link> and how Ask Maal frames investing questions. It doesn’t change
              your super fund’s investment option or any account you’ve linked.
            </InfoLine>
          </>
        )}
      </SettingsCard>

      {open && state && (
        <RiskAssessmentDialog
          questionnaire={state.questions}
          initialAnswers={initialAnswers}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
