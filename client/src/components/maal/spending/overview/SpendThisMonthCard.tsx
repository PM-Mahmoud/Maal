import { useId, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronDown, LineChart } from "lucide-react";
import { monthCumulative, shiftMonth } from "../../../../../../shared/spending-overview.mjs";
import { AskSparkButton, HomeCard } from "@/components/maal/home/HomeCard";
import { aud, audCompact } from "@/components/maal/home/format";
import { usePrivacy } from "@/components/maal/home/prefs";
import type { SpendTxn } from "./useSpendingData";

const W = 1000;
const H = 220;
const PAD_TOP = 14;

const monthLabel = (y: number, m: number) => new Date(y, m, 1).toLocaleDateString("en-AU", { month: "long" });

/**
 * "Spend this month": big total, cumulative line for this month against a
 * dashed line for a chosen earlier month, an optional dashed budget line,
 * and a toggle to a calendar of each day's spend.
 */
export function SpendThisMonthCard({
  transactions, excluded, budget, loading, error, today,
}: {
  transactions: SpendTxn[];
  excluded: string[] | undefined;
  budget: number;
  loading: boolean;
  error?: boolean;
  today: Date;
}) {
  const [view, setView] = useState<"chart" | "calendar">("chart");
  const [compareBack, setCompareBack] = useState(1);
  const privacy = usePrivacy();
  const year = today.getFullYear();
  const month = today.getMonth();
  const current = useMemo(() => monthCumulative(transactions, year, month, excluded, today), [transactions, year, month, excluded, today]);
  const cmpYm = shiftMonth(year, month, compareBack);
  const compare = useMemo(
    () => monthCumulative(transactions, cmpYm.year, cmpYm.month, excluded, today),
    [transactions, cmpYm.year, cmpYm.month, excluded, today],
  );
  const name = monthLabel(year, month);
  const cmpName = monthLabel(cmpYm.year, cmpYm.month);
  const empty = !loading && !error && transactions.length === 0;

  return (
    <HomeCard label="Spend this month" labelId="so-spend-label" className="so-spend"
      actions={<>
        <div className="so-seg" role="group" aria-label="Chart or calendar">
          <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")} aria-label="Show chart" title="Chart"><LineChart aria-hidden /></button>
          <button type="button" aria-pressed={view === "calendar"} onClick={() => setView("calendar")} aria-label="Show calendar" title="Calendar"><CalendarDays aria-hidden /></button>
        </div>
        <AskSparkButton label="Ask Maal about this month's spending"
          question={`How is my spending tracking in ${name} compared with ${cmpName}? Anything I should watch?`} />
      </>}>
      <div className="so-spend-top">
        <div>
          {loading ? <div className="mh-skel" style={{ width: 120, height: 38 }} /> : (
            <p className={error ? "mh-big" : "mh-big mh-amount"}>{error ? "—" : aud(current.total)}</p>
          )}
          {view === "chart" && !empty && <p className="so-legend"><i className="so-dot" aria-hidden />{name}</p>}
        </div>
        {view === "chart" && !empty && !error && (
          <label className="so-select">
            <span className="sr-only">Compare with</span>
            <i className="so-dash" aria-hidden />
            <select value={compareBack} onChange={(e) => setCompareBack(Number(e.target.value))}>
              {[1, 2, 3].map((k) => {
                const ym = shiftMonth(year, month, k);
                return <option key={k} value={k}>vs {monthLabel(ym.year, ym.month)}</option>;
              })}
            </select>
            <ChevronDown aria-hidden />
          </label>
        )}
      </div>

      {error ? (
        <p className="mh-muted mh-small mt-4 mb-0">Your transactions couldn’t load right now. Try again shortly.</p>
      ) : empty ? (
        <div className="mh-empty">
          <p className="mh-serif-title" style={{ fontSize: 22 }}>See how your month is tracking</p>
          <p className="mt-2">Connect your everyday bank account and Maal will chart your spending day by day.</p>
          <Link to="/app/accounts/connect" className="mh-btn-ink mt-4">Connect a bank</Link>
        </div>
      ) : view === "chart" ? (
        <SpendChart current={current.cumulative} compare={compare.cumulative} budget={budget}
          loading={loading} privacy={privacy} label={`Cumulative spending in ${name} compared with ${cmpName}`} />
      ) : (
        <MonthCalendar daily={current.daily} year={year} month={month} today={today} privacy={privacy} />
      )}
    </HomeCard>
  );
}

function SpendChart({ current, compare, budget, loading, privacy, label }: {
  current: Array<number | null>;
  compare: Array<number | null>;
  budget: number;
  loading: boolean;
  privacy: boolean;
  label: string;
}) {
  const gid = useId().replace(/:/g, "");
  const days = current.length;
  const geo = useMemo(() => {
    const vals = [...current, ...compare].filter((v): v is number => v !== null);
    const max = Math.max(1, ...vals, budget > 0 ? budget : 0) * 1.08;
    const x = (i: number, n: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
    const y = (v: number) => PAD_TOP + (1 - v / max) * (H - PAD_TOP - 4);
    const path = (series: Array<number | null>, n: number) => {
      let d = "";
      series.forEach((v, i) => { if (v !== null) d += `${d ? "L" : "M"}${x(i, n).toFixed(1)},${y(v).toFixed(1)} `; });
      return d.trim();
    };
    const lastIdx = (series: Array<number | null>) => {
      for (let i = series.length - 1; i >= 0; i--) if (series[i] !== null) return i;
      return -1;
    };
    const ci = lastIdx(current);
    const cmpi = lastIdx(compare);
    const line = path(current, days);
    const area = ci > 0 ? `${line} L${x(ci, days).toFixed(1)},${H} L0,${H} Z` : "";
    return {
      line, area,
      cmp: path(compare, compare.length),
      budgetY: budget > 0 ? y(budget) : null,
      dot: ci >= 0 ? { left: (x(ci, days) / W) * 100, top: (y(current[ci] as number) / H) * 100 } : null,
      cmpDot: cmpi >= 0 ? { left: (x(cmpi, compare.length) / W) * 100, top: (y(compare[cmpi] as number) / H) * 100 } : null,
    };
  }, [current, compare, budget, days]);

  const ticks = [1, 8, 15, 22, 29].filter((d) => d <= days);
  if (loading) return <div className="mh-skel mt-4" style={{ height: H }} />;
  const spentNow = [...current].reverse().find((v) => v !== null) ?? 0;

  return (
    <figure className="so-chart" style={{ height: H + 26 }}>
      <div className="so-plot" style={{ height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
          aria-label={privacy ? `${label}: amounts hidden` : `${label}: ${aud(spentNow)} so far`}>
          <defs>
            <linearGradient id={`so-fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--mh-ink)" stopOpacity=".12" />
              <stop offset="100%" stopColor="var(--mh-ink)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {geo.budgetY !== null && (
            <line x1="0" x2={W} y1={geo.budgetY} y2={geo.budgetY} className="so-budget-line" vectorEffect="non-scaling-stroke" />
          )}
          {geo.cmp && <path d={geo.cmp} className="so-cmp-line" vectorEffect="non-scaling-stroke" />}
          {geo.area && <path d={geo.area} fill={`url(#so-fill-${gid})`} />}
          {geo.line && <path d={geo.line} className="so-cur-line" vectorEffect="non-scaling-stroke" />}
        </svg>
        {geo.budgetY !== null && (
          <span className="so-budget-tag mh-amount" style={{ top: `${(geo.budgetY / H) * 100}%` }}>{audCompact(budget)} Budget</span>
        )}
        {geo.cmpDot && <i className="so-end so-end--cmp" style={{ left: `${geo.cmpDot.left}%`, top: `${geo.cmpDot.top}%` }} aria-hidden />}
        {geo.dot && <i className="so-end" style={{ left: `${geo.dot.left}%`, top: `${geo.dot.top}%` }} aria-hidden />}
      </div>
      <div className="so-xaxis" aria-hidden>
        {ticks.map((d) => (
          <span key={d} style={{ left: `${((d - 1) / Math.max(1, days - 1)) * 100}%` }}>{String(d).padStart(2, "0")}</span>
        ))}
      </div>
    </figure>
  );
}

function MonthCalendar({ daily, year, month, today, privacy }: {
  daily: Array<number | null>;
  year: number;
  month: number;
  today: Date;
  privacy: boolean;
}) {
  const name = monthLabel(year, month);
  const isCurrent = today.getFullYear() === year && today.getMonth() === month;
  return (
    <div className="mh-cal so-cal" role="list" aria-label={`Daily spending in ${name}`}>
      {daily.map((v, i) => {
        const day = i + 1;
        const isToday = isCurrent && day === today.getDate();
        const future = v === null;
        return (
          <div key={day} role="listitem" className="mh-day" data-today={isToday} data-future={future} data-past={!future && !isToday}
            aria-label={`${day} ${name}: ${future ? "upcoming" : privacy ? "amount hidden" : aud(v ?? 0)}`}>
            <span>{day}</span>
            <b className={future ? undefined : "mh-amount"}>{future ? "–" : (v ?? 0) >= 1000 ? audCompact(v ?? 0) : aud(v ?? 0)}</b>
          </div>
        );
      })}
    </div>
  );
}
