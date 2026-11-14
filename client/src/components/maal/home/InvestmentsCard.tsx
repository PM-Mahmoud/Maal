import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Snapshot } from "@/lib/snapshots";
import { holdingReturn, seriesChange, sliceSeries, type HomeRange } from "../../../../../shared/home-accounts.mjs";
import { AreaChart } from "./AreaChart";
import { AskSparkButton, HomeCard } from "./HomeCard";
import { aud, audCents, pctText, signedCents } from "./format";

const INV_RANGES: HomeRange[] = ["1M", "3M", "YTD", "ALL"];

/** Investments (excluding super): live total, history and largest holdings. */
export function InvestmentsCard({
  total, snapshots, rows, loading,
}: {
  total: number;
  snapshots: Snapshot[];
  rows: Array<Record<string, any>>;
  loading: boolean;
}) {
  const [range, setRange] = useState<HomeRange>("3M");
  const points = useMemo(() => {
    const s = sliceSeries(snapshots.map((x) => ({ date: x.date, value: Number(x.investments) || 0 })), range);
    if (s.length) s[s.length - 1] = { ...s[s.length - 1], value: total };
    return s;
  }, [snapshots, range, total]);
  const { change, pct } = seriesChange(points);
  const tone = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const holdings = useMemo(
    () => [...rows].sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 4),
    [rows],
  );
  const empty = !loading && rows.length === 0;

  return (
    <HomeCard label="Investments" to="/app/wealth/investments" labelId="mh-inv-label"
      actions={<AskSparkButton label="Ask Maal about your investments" question="How are my investments tracking, and is my mix sensible for my age?" />}>
      {empty ? (
        <div className="mh-empty">
          <p>Add your ETFs, shares or crypto to see how they’re tracking.</p>
          <Link to="/app/wealth/investments" className="mh-btn-outline mt-3">Add investments</Link>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-3 flex-wrap">
            {loading ? <div className="mh-skel" style={{ width: 110, height: 38 }} /> : (
              <p className="mh-big mh-amount">{aud(total)}</p>
            )}
            {points.length > 1 && (
              <span className="mh-delta mh-amount" data-tone={tone} style={{ marginTop: 0 }}>
                {signedCents(change)}{pctText(pct)}
              </span>
            )}
          </div>
          <AreaChart label="Investments value" points={points} height={130}
            emptyMessage="Your investment history fills in as Maal records daily balances." />
          <div className="mh-ranges" role="group" aria-label="Investments chart range">
            {INV_RANGES.map((r) => (
              <button key={r} type="button" className="mh-range" aria-pressed={range === r} onClick={() => setRange(r)}>{r}</button>
            ))}
          </div>
          {holdings.length > 0 && (
            <>
              <p className="mh-section-label">Largest holdings</p>
              <ul className="list-none m-0 p-0">
                {holdings.map((h) => {
                  const r = holdingReturn(h.value, h.cost_basis);
                  return (
                    <li key={h.id} className="mh-txn">
                      <span className="min-w-0">
                        <span className="mh-txn-name block">{h.ticker ? `${String(h.ticker).toUpperCase()} · ` : ""}{h.name}</span>
                        <span className="mh-txn-date block">{h.kind && h.kind !== "other" ? String(h.kind).toUpperCase() : "Holding"}</span>
                      </span>
                      <span className="mh-txn-amt text-right">
                        <span className="mh-amount block">{audCents(Number(h.value) || 0)}</span>
                        {r.pct !== null && (
                          <span className="mh-small block" style={{ color: r.pct >= 0 ? "var(--mh-good)" : "var(--mh-bad)" }}>
                            {r.pct >= 0 ? "+" : ""}{r.pct.toFixed(2)}%
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </HomeCard>
  );
}
