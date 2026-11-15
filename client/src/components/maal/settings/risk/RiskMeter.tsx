import { BANDS, type RiskBand } from "./api";

const LABELS: Record<RiskBand, string> = { conservative: "Conservative", balanced: "Balanced", growth: "Growth", "high-growth": "High Growth" };

/** Four-segment monochrome meter showing where a band sits. */
export function RiskMeter({ band }: { band: RiskBand }) {
  const at = BANDS.indexOf(band);
  return (
    <div role="img" aria-label={`Risk level ${at + 1} of 4: ${LABELS[band]}`}>
      <div className="mst-meter" aria-hidden="true">
        {BANDS.map((b, i) => <span key={b} className={i <= at ? "on" : ""} />)}
      </div>
      <div className="mst-meter-labels" aria-hidden="true">
        {BANDS.map((b) => <span key={b}>{LABELS[b]}</span>)}
      </div>
    </div>
  );
}
