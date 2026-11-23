import { useMemo, useState } from "react";
import { BarChart3, ChevronDown, GitFork, SquareSplitVertical } from "lucide-react";
import { cashFlowSummary, monthlyCashFlow, sankeyFlows } from "../../../../../../shared/spending-overview.mjs";
import { AskSparkButton, HomeCard } from "@/components/maal/home/HomeCard";
import { aud, audTick } from "@/components/maal/home/format";
import { usePrivacy } from "@/components/maal/home/prefs";
import type { SpendTxn } from "./useSpendingData";
import { catColour, dataColour, useCustomColours } from "../categoryColour";

type Row = { key: string; year: number; month: number; income: number; expenses: number; net: number };
type View = "net" | "split" | "flow";
const MONTHS = 6;

const shortMonth = (r: Row, withYear: boolean) =>
  new Date(r.year, r.month, 1).toLocaleDateString("en-AU", withYear ? { month: "short", year: "2-digit" } : { month: "short" });
const longMonth = (r: Row) => new Date(r.year, r.month, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
const signedAud = (n: number) => (n < 0 ? `-${aud(Math.abs(n))}` : aud(n));

/** Reports: last six months of cash flow as bars, income vs expenses, or a Sankey; summary strip + monthly table. */
export function ReportsCard({ transactions, excluded, loading, error, today }: {
  transactions: SpendTxn[];
  excluded: string[] | undefined;
  loading: boolean;
  error?: boolean;
  today: Date;
}) {
  const [view, setView] = useState<View>("net");
  const [by, setBy] = useState<"category" | "merchant">("category");
  const privacy = usePrivacy();
  const rows = useMemo(
    () => monthlyCashFlow(transactions, today.getFullYear(), today.getMonth(), MONTHS, excluded) as Row[],
    [transactions, excluded, today],
  );
  const sum = cashFlowSummary(rows);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const rangeText = first && last
    ? `${new Date(first.year, first.month, 1).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })} – ${today.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
    : "";
  const flows = useMemo(
    () => (first && last ? sankeyFlows(transactions, first.key, last.key, excluded, by) : null),
    [transactions, first, last, excluded, by],
  );
  const empty = !loading && !error && rows.every((r) => r.income === 0 && r.expenses === 0);

  const VIEWS: Array<{ v: View; label: string; Icon: typeof BarChart3 }> = [
    { v: "net", label: "Net cash flow", Icon: SquareSplitVertical },
    { v: "split", label: "Income and expenses", Icon: BarChart3 },
    { v: "flow", label: "Where your money flows", Icon: GitFork },
  ];

  return (
    <HomeCard label="Reports" labelId="so-reports-label" className="so-reports"
      actions={<AskSparkButton label="Ask Maal about your cash flow" question="Looking at my last six months of income and spending, how is my cash flow trending and what's driving it?" />}>
      <div id="reports" className="so-anchor" />
      <div className="so-rep-top">
        <div>
          <p className="so-rep-title">Last 6 months</p>
          <p className="mh-muted mh-small m-0">{rangeText}</p>
        </div>
        <div className="so-seg" role="group" aria-label="Report view">
          {VIEWS.map(({ v, label, Icon }) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} aria-label={label} title={label}>
              <Icon aria-hidden />
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="mh-skel mt-4" style={{ height: 240 }} /> : error ? (
        <p className="mh-muted mh-small mt-4 mb-0">Your transactions couldn’t load right now.</p>
      ) : empty ? (
        <div className="mh-empty mt-2"><p className="m-0">Reports appear once Maal has a few weeks of your transactions.</p></div>
      ) : (
        <>
          {view === "flow" ? (
            <>
              <label className="so-viewby">
                <span className="mh-muted mh-small">View by</span>
                <span className="so-select">
                  <select value={by} onChange={(e) => setBy(e.target.value as "category" | "merchant")}>
                    <option value="category">Category</option>
                    <option value="merchant">Merchant</option>
                  </select>
                  <ChevronDown aria-hidden />
                </span>
              </label>
              {flows && <Sankey flows={flows} privacy={privacy} />}
            </>
          ) : (
            <Bars rows={rows} view={view} privacy={privacy} />
          )}

          <dl className="so-strip">
            <div><dt>Total income</dt><dd className="mh-amount">{aud(sum.income)}</dd></div>
            <div><dt>Total expenses</dt><dd className="mh-amount">{aud(sum.expenses)}</dd></div>
            <div><dt>Net cash flow</dt><dd className="mh-amount">{signedAud(sum.net)}</dd></div>
            <div><dt>Avg cash flow / mo</dt><dd className="mh-amount">{signedAud(sum.avgPerMonth)}</dd></div>
          </dl>

          <div className="so-table-wrap">
            <table className="so-table">
              <thead>
                <tr><th scope="col">Month</th><th scope="col">Income</th><th scope="col">Expenses</th><th scope="col">Net cash flow</th></tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r) => (
                  <tr key={r.key}>
                    <th scope="row">{r.key === last?.key || r.year === today.getFullYear() ? new Date(r.year, r.month, 1).toLocaleDateString("en-AU", { month: "long" }) : longMonth(r)}</th>
                    <td className="mh-amount">{aud(r.income)}</td>
                    <td className="mh-amount">{aud(r.expenses)}</td>
                    <td className="mh-amount">{signedAud(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </HomeCard>
  );
}

const BW = 600;
const BH = 220;

function Bars({ rows, view, privacy }: { rows: Row[]; view: "net" | "split"; privacy: boolean }) {
  const geo = useMemo(() => {
    const vals = view === "net" ? rows.map((r) => r.net) : rows.flatMap((r) => [r.income, r.expenses]);
    const hi = Math.max(0, ...vals);
    const lo = Math.min(0, ...vals);
    // Round gridlines: a 1/2/2.5/5 × 10^n step giving about four intervals.
    const raw = (hi - lo || 1) / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = ([1, 2, 2.5, 5, 10].find((s) => s * mag >= raw) ?? 10) * mag;
    const min = Math.floor(lo / step) * step;
    const max = Math.max(min + step, Math.ceil(hi / step) * step);
    const y = (v: number) => 8 + (1 - (v - min) / (max - min)) * (BH - 16);
    const ticks: number[] = [];
    for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v));
    return { y, zero: y(0), ticks, span: max - min };
  }, [rows, view]);
  const slot = BW / rows.length;
  const crossYear = rows.length > 0 && rows[0].year !== rows[rows.length - 1].year;
  const label = view === "net" ? "Net cash flow by month" : "Income and expenses by month";
  const summary = privacy ? `${label}: amounts hidden`
    : `${label}: ${rows.map((r) => `${longMonth(r)} ${view === "net" ? signedAud(r.net) : `income ${aud(r.income)}, expenses ${aud(r.expenses)}`}`).join("; ")}`;
  const pts = rows.map((r, i) => ({ x: slot * i + slot / 2, y: geo.y(r.net) }));

  return (
    <figure className="so-bars">
      <div className="so-bars-plot">
        <svg viewBox={`0 0 ${BW} ${BH}`} preserveAspectRatio="none" role="img" aria-label={summary}>
          {geo.ticks.map((t, i) => <line key={i} x1="0" x2={BW} y1={geo.y(t)} y2={geo.y(t)} className="so-gridline" vectorEffect="non-scaling-stroke" />)}
          <line x1="0" x2={BW} y1={geo.zero} y2={geo.zero} className="so-zero" vectorEffect="non-scaling-stroke" />
          {rows.map((r, i) => {
            const cx = slot * i + slot / 2;
            if (view === "net") {
              const y = geo.y(r.net);
              return <rect key={r.key} x={cx - 14} width={28} y={Math.min(y, geo.zero)} height={Math.max(1, Math.abs(geo.zero - y))} rx="2" className="so-bar" data-neg={r.net < 0} style={{ fill: dataColour(r.net < 0 ? "negative" : "positive") }} />;
            }
            const yi = geo.y(r.income);
            const ye = geo.y(r.expenses);
            return (
              <g key={r.key}>
                <rect x={cx - 24} width={22} y={yi} height={Math.max(r.income ? 1 : 0, geo.zero - yi)} rx="2" className="so-bar" style={{ fill: dataColour("income") }} />
                <rect x={cx + 2} width={22} y={ye} height={Math.max(r.expenses ? 1 : 0, geo.zero - ye)} rx="2" className="so-bar so-bar--alt" style={{ fill: dataColour("expense") }} />
              </g>
            );
          })}
          {view === "net" && pts.length > 1 && (
            <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} className="so-trend" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        <div className="so-yaxis" aria-hidden>
          {geo.ticks.map((t, i) => (
            <span key={i} className="mh-amount" style={{ top: `${(geo.y(t) / BH) * 100}%` }}>{audTick(t, geo.span)}</span>
          ))}
        </div>
      </div>
      <div className="so-bars-x" aria-hidden>
        {rows.map((r) => <span key={r.key}>{shortMonth(r, crossYear && r.month === 0 || r === rows[0] && crossYear)}</span>)}
      </div>
      {view === "split" && (
        <p className="so-bars-legend" aria-hidden><i className="so-key" style={{ background: dataColour("income") }} /> Income <i className="so-key so-key--alt" style={{ background: dataColour("expense") }} /> Expenses</p>
      )}
    </figure>
  );
}

type Flows = { sources: Array<{ label: string; amount: number; pct: number }>; targets: Array<{ label: string; amount: number; pct: number }>; totalIn: number; totalOut: number };

/** Sankey: income sources → Maal (middle) → spending categories. Ribbons in SVG, labels in HTML so text never stretches. */
function Sankey({ flows, privacy }: { flows: Flows; privacy: boolean }) {
  const custom = useCustomColours();
  const SW = 1000;
  const GAP = 18;
  const NODE_W = 14;
  // Each node gets a block at least MIN_SLOT tall so its two-line label never
  // collides with a neighbour's; the bar is centred in its block.
  const MIN_SLOT = 40;
  const USABLE = 260;
  const scale = Math.max(flows.totalIn, flows.totalOut) || 1;
  const px = (v: number) => Math.max(3, (v / scale) * USABLE);
  const blocksOf = (nodes: Flows["sources"]) => nodes.map((x) => Math.max(MIN_SLOT, px(x.amount)));
  const sideH = (nodes: Flows["sources"]) => blocksOf(nodes).reduce((a, b) => a + b, 0) + GAP * Math.max(0, nodes.length - 1);
  const H = Math.ceil(Math.max(300, sideH(flows.sources), sideH(flows.targets)) + 12);

  const layout = (nodes: Flows["sources"]) => {
    const blocks = blocksOf(nodes);
    let top = (H - sideH(nodes)) / 2;
    return nodes.map((node, i) => {
      const h = px(node.amount);
      const out = { ...node, y: top + (blocks[i] - h) / 2, h };
      top += blocks[i] + GAP;
      return out;
    });
  };
  const left = layout(flows.sources);
  const right = layout(flows.targets);
  const midH = Math.max(px(flows.totalIn), px(flows.totalOut));
  const midY = (H - midH) / 2;
  const midX = SW / 2 - NODE_W / 2;

  const ribbon = (x0: number, a0: number, a1: number, x1: number, b0: number, b1: number) => {
    const xm = (x0 + x1) / 2;
    return `M${x0},${a0} C${xm},${a0} ${xm},${b0} ${x1},${b0} L${x1},${b1} C${xm},${b1} ${xm},${a1} ${x0},${a1} Z`;
  };
  let inCursor = midY + (midH - px(flows.totalIn)) / 2;
  let outCursor = midY + (midH - px(flows.totalOut)) / 2;
  const summary = privacy ? "Money in and out over six months: amounts hidden"
    : `Money in: ${flows.sources.map((s) => `${s.label} ${aud(s.amount)}`).join(", ") || "none"}. Money out: ${flows.targets.map((t) => `${t.label} ${aud(t.amount)}`).join(", ") || "none"}.`;

  return (
    <figure className="so-sankey" style={{ height: H }}>
      <svg viewBox={`0 0 ${SW} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary}>
        {left.map((s) => {
          const d = ribbon(NODE_W, s.y, s.y + s.h, midX, inCursor, inCursor + s.h);
          inCursor += s.h;
          return <path key={`l-${s.label}`} d={d} className="so-ribbon" style={{ fill: dataColour("income") }} />;
        })}
        {right.map((t) => {
          const d = ribbon(midX + NODE_W, outCursor, outCursor + t.h, SW - NODE_W, t.y, t.y + t.h);
          outCursor += t.h;
          return <path key={`r-${t.label}`} d={d} className="so-ribbon" style={{ fill: (t.label === "Everything else" ? dataColour("neutral") : catColour(t.label, custom)) }} />;
        })}
        {left.map((s) => <rect key={`ln-${s.label}`} x="0" y={s.y} width={NODE_W} height={s.h} rx="3" className="so-node" style={{ fill: dataColour("income") }} />)}
        <rect x={midX} y={midY} width={NODE_W} height={midH} rx="3" className="so-node" />
        {right.map((t) => <rect key={`rn-${t.label}`} x={SW - NODE_W} y={t.y} width={NODE_W} height={t.h} rx="3" className="so-node" style={{ fill: (t.label === "Everything else" ? dataColour("neutral") : catColour(t.label, custom)) }} />)}
      </svg>
      {left.map((s) => (
        <span key={`lt-${s.label}`} className="so-sk-label so-sk-label--l" style={{ top: s.y + s.h / 2 }}>
          <b>{s.label}</b><span className="mh-amount">{aud(s.amount)} ({s.pct.toFixed(1)}%)</span>
        </span>
      ))}
      {right.map((t) => (
        <span key={`rt-${t.label}`} className="so-sk-label so-sk-label--r" style={{ top: t.y + t.h / 2 }}>
          <b>{t.label}</b><span className="mh-amount">{aud(t.amount)} ({t.pct.toFixed(1)}%)</span>
        </span>
      ))}
      {left.length === 0 && <span className="so-sk-label so-sk-label--l" style={{ top: H / 2 }}><b>No income recorded</b></span>}
    </figure>
  );
}
