import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthlyCashFlow, shiftMonth } from "../../../../../../shared/spending-overview.mjs";
import { HomeCard } from "@/components/maal/home/HomeCard";
import { audCents, signedCents } from "@/components/maal/home/format";
import { usePrivacy } from "@/components/maal/home/prefs";
import type { SpendTxn } from "../overview/useSpendingData";
import { monthLabel } from "./parts";

const WINDOW = 12;

/**
 * Time period (HEL-84): one column per month with a monochrome spend bar.
 * Picking a month drives the rest of the page; hovering or focusing a month
 * shows its income, expenses and net cash flow. Future months can't be picked.
 * At phone width only the last six columns of the window show.
 */
export function PeriodCard({ transactions, excluded, year, month, today, onPick, loading, error }: {
  transactions: SpendTxn[];
  excluded: string[] | undefined;
  year: number;
  month: number;
  today: Date;
  onPick: (year: number, month: number) => void;
  loading: boolean;
  error?: boolean;
}) {
  const privacy = usePrivacy();
  // Window end: the selected month's window, never past this month.
  const [back, setBack] = useState(() => (today.getFullYear() - year) * 12 + (today.getMonth() - month) >= WINDOW ? Math.floor(((today.getFullYear() - year) * 12 + (today.getMonth() - month)) / 6) * 6 : 0);
  const end = shiftMonth(today.getFullYear(), today.getMonth(), back);
  const rows = useMemo(
    () => monthlyCashFlow(transactions, end.year, end.month, WINDOW, excluded) as Array<{ key: string; year: number; month: number; income: number; expenses: number; net: number }>,
    [transactions, end.year, end.month, excluded],
  );
  const max = Math.max(1, ...rows.map((r) => r.expenses));
  const [hover, setHover] = useState<string | null>(null);
  const shown = rows.find((r) => r.key === hover);

  return (
    <HomeCard label="Time period" labelId="bd-period-label" className="bd-period" bodyClassName="bd-period-body">
      {loading ? <div className="mh-skel" style={{ height: 120 }} /> : error ? (
        <p className="mh-muted mh-small m-0">Your spending history couldn’t load right now.</p>
      ) : (
        <div className="bd-pstrip">
          <button type="button" className="ss-iconbtn" onClick={() => setBack((b) => b + 6)} aria-label="Earlier months"><ChevronLeft aria-hidden /></button>
          <div className="bd-pcols" role="group" aria-label="Choose a month" onMouseLeave={() => setHover(null)}>
            {rows.map((r, i) => {
              const selected = r.year === year && r.month === month;
              const h = r.expenses > 0 ? Math.max(4, (r.expenses / max) * 100) : 0;
              const showYear = r.month === 0 || i === 0;
              const label = showYear ? `${new Date(r.year, r.month).toLocaleDateString("en-AU", { month: "short" })} ’${String(r.year).slice(2)}` : new Date(r.year, r.month).toLocaleDateString("en-AU", { month: "short" });
              return (
                <button key={r.key} type="button" className="bd-pcol" aria-pressed={selected}
                  aria-label={`${label}${showYear ? "" : ` ${r.year}`}${privacy ? "" : `, spent ${audCents(r.expenses)}`}`}
                  onClick={() => onPick(r.year, r.month)}
                  onMouseEnter={() => setHover(r.key)} onFocus={() => setHover(r.key)} onBlur={() => setHover(null)}>
                  <span className="bd-pplot">
                    <svg viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden>
                      <line x1="0" y1="99.5" x2="10" y2="99.5" className="bd-pbase" vectorEffect="non-scaling-stroke" />
                      {h > 0 && <rect x="2.5" y={100 - h} width="5" height={h} rx="0.6" className="bd-pbar" data-sel={selected} />}
                    </svg>
                  </span>
                  <span className="bd-plabel">{label}</span>
                </button>
              );
            })}
            {shown && (
              <div className="bd-ptip" role="status"
                style={{ left: `${((rows.indexOf(shown) + 0.5) / rows.length) * 100}%` }} data-edge={rows.indexOf(shown) > rows.length - 3 ? "right" : rows.indexOf(shown) < 2 ? "left" : undefined}>
                <b>{monthLabel(shown.year, shown.month)}</b>
                <span><i className="bd-key bd-key--alt" />Income <em className="mh-amount">{audCents(shown.income)}</em></span>
                <span><i className="bd-key" />Expenses <em className="mh-amount">{signedCents(-shown.expenses)}</em></span>
                <span>Net cash flow <em className="mh-amount">{signedCents(shown.net)}</em></span>
              </div>
            )}
          </div>
          <button type="button" className="ss-iconbtn" onClick={() => setBack((b) => Math.max(0, b - 6))} disabled={back === 0} aria-label="Later months"><ChevronRight aria-hidden /></button>
        </div>
      )}
    </HomeCard>
  );
}
