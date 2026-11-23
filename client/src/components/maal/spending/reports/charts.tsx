// Report charts. Adapted copies of the overview's ReportsCard Bars/Sankey
// (those aren't exported, and the overview's files belong to another part):
// SVG with preserveAspectRatio="none" + non-scaling strokes, every label in
// positioned HTML so text never stretches. Colour: the shared category
// palette (../categoryColour.ts) for stacks, donut and Sankey; income green,
// expenses warm, negative periods red.
import { useMemo } from "react";
import { aud, audTick } from "@/components/maal/home/format";
import { catColour, dataColour, useCustomColours } from "../categoryColour";

const BW = 600;
const BH = 240;

export type BarsInput =
  | { mode: "net"; values: number[] }
  | { mode: "split"; pairs: Array<[number, number]>; legend: [string, string] }
  | { mode: "stack"; stacks: number[][]; legend: string[]; colours: string[] };

/** Round gridlines: a 1/2/2.5/5 × 10^n step giving about four intervals. */
function scale(lo: number, hi: number) {
  const raw = (hi - lo || 1) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((s) => s * mag >= raw) ?? 10) * mag;
  const min = Math.floor(lo / step) * step;
  const max = Math.max(min + step, Math.ceil(hi / step) * step);
  const y = (v: number) => 8 + (1 - (v - min) / (max - min)) * (BH - 16);
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { y, ticks, span: max - min };
}

/** Bars per period: net (signed, with trend line), split pairs, or stacked segments. */
export function PeriodBars({ data, labels, summary }: { data: BarsInput; labels: string[]; summary: string }) {
  const n = labels.length;
  const geo = useMemo(() => {
    let vals: number[];
    if (data.mode === "net") vals = data.values;
    else if (data.mode === "split") vals = data.pairs.flat();
    else vals = data.stacks.map((s) => s.reduce((a, b) => a + b, 0));
    return scale(Math.min(0, ...vals), Math.max(0, ...vals));
  }, [data]);
  const zero = geo.y(0);
  const slot = BW / Math.max(1, n);
  const single = Math.min(28, slot * 0.62);
  const half = Math.min(22, slot * 0.36);
  // Thin the x labels so they never collide: at most 7 on desktop; CSS hides
  // every other shown label on phones (data-alt).
  const step = Math.max(1, Math.ceil(n / 7));
  const shown = labels.map((_, i) => i % step === 0);
  let k = 0;
  const alt = shown.map((s) => (s ? (k++ % 2 === 1) : false));

  return (
    <figure className="rp-bars">
      <div className="rp-bars-plot">
        <div className="rp-bars-area">
        <svg viewBox={`0 0 ${BW} ${BH}`} preserveAspectRatio="none" role="img" aria-label={summary}>
          {geo.ticks.map((t, i) => <line key={i} x1="0" x2={BW} y1={geo.y(t)} y2={geo.y(t)} className="rp-gridline" vectorEffect="non-scaling-stroke" />)}
          <line x1="0" x2={BW} y1={zero} y2={zero} className="rp-zero" vectorEffect="non-scaling-stroke" />
          {labels.map((_, i) => {
            const cx = slot * i + slot / 2;
            if (data.mode === "net") {
              const v = data.values[i] ?? 0;
              const y = geo.y(v);
              return <rect key={i} x={cx - single / 2} width={single} y={Math.min(y, zero)} height={v ? Math.max(1, Math.abs(zero - y)) : 0} rx="2" className="rp-bar" data-neg={v < 0} style={{ fill: dataColour(v < 0 ? "negative" : "positive") }} />;
            }
            if (data.mode === "split") {
              const [a, b] = data.pairs[i] ?? [0, 0];
              const ya = geo.y(a);
              const yb = geo.y(b);
              return (
                <g key={i}>
                  <rect x={cx - half - 1} width={half} y={ya} height={a ? Math.max(1, zero - ya) : 0} rx="2" className="rp-bar" style={{ fill: dataColour("income") }} />
                  <rect x={cx + 1} width={half} y={yb} height={b ? Math.max(1, zero - yb) : 0} rx="2" className="rp-bar rp-bar--alt" style={{ fill: dataColour("expense") }} />
                </g>
              );
            }
            const segs = data.stacks[i] ?? [];
            const drawn = segs.filter((v) => v > 0).length;
            let top = zero;
            return (
              <g key={i}>
                {segs.map((v, j) => {
                  if (!(v > 0)) return null;
                  const h = Math.max(1, zero - geo.y(v));
                  top -= h;
                  // Surface gap between stacked segments (dataviz spacer rule).
                  const g = drawn > 1 && h > 3 ? 1 : 0;
                  return <rect key={j} x={cx - single / 2} width={single} y={top + g} height={Math.max(1, h - g * 2)} className="rp-bar" style={{ fill: data.colours[j] }} />;
                })}
              </g>
            );
          })}
          {data.mode === "net" && n > 1 && (
            <polyline points={data.values.map((v, i) => `${slot * i + slot / 2},${geo.y(v)}`).join(" ")} className="rp-trend" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {data.mode === "net" && n > 1 && n <= 24 && data.values.map((v, i) => (
          <i key={i} className="rp-trend-dot" style={{ left: `${((slot * i + slot / 2) / BW) * 100}%`, top: `${(geo.y(v) / BH) * 100}%` }} aria-hidden />
        ))}
        </div>
        <div className="rp-yaxis" aria-hidden>
          {geo.ticks.map((t, i) => (
            <span key={i} className="mh-amount" style={{ top: `${(geo.y(t) / BH) * 100}%` }}>{audTick(t, geo.span)}</span>
          ))}
        </div>
      </div>
      <div className="rp-bars-x" aria-hidden>
        {labels.map((l, i) => shown[i] && (
          <span key={i} data-alt={alt[i]} style={{ left: `${((slot * i + slot / 2) / BW) * 100}%` }}>{l}</span>
        ))}
      </div>
      {data.mode === "split" && (
        <p className="rp-legend" aria-hidden>
          <span><i className="rp-key" style={{ background: dataColour("income") }} />{data.legend[0]}</span>
          <span><i className="rp-key rp-key--alt" style={{ background: dataColour("expense") }} />{data.legend[1]}</span>
        </p>
      )}
      {data.mode === "stack" && data.legend.length > 0 && (
        <p className="rp-legend" aria-hidden>
          {data.legend.map((l, j) => <span key={l}><i className="rp-key" style={{ background: data.colours[j] }} />{l}</span>)}
        </p>
      )}
    </figure>
  );
}

/** Donut of a breakdown, total in the middle (HTML). Segments use each row's category colour. */
export function Donut({ rows, total, caption, summary, colourOf }: {
  rows: Array<{ label: string; amount: number }>;
  colourOf: (label: string) => string;
  total: number;
  caption: string;
  summary: string;
}) {
  const R = 80;
  const C = 2 * Math.PI * R;
  const gap = rows.length > 1 ? 6 : 0;
  let offset = 0;
  return (
    <figure className="rp-donut">
      <svg viewBox="0 0 200 200" role="img" aria-label={summary}>
        <circle cx="100" cy="100" r={R} className="rp-donut-track" />
        {total > 0 && rows.map((r) => {
          const len = (r.amount / total) * C;
          const dash = Math.max(0.5, len - gap);
          const el = (
            <circle key={r.label} cx="100" cy="100" r={R} className="rp-donut-seg"
              style={{ stroke: colourOf(r.label) }}
              strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset} transform="rotate(-90 100 100)" />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="rp-donut-text">
        <span className="rp-donut-amt mh-amount">{aud(total)}</span>
        <span className="rp-donut-sub">{caption}</span>
      </div>
    </figure>
  );
}

type Flows = { sources: Array<{ label: string; amount: number; pct: number }>; targets: Array<{ label: string; amount: number; pct: number }>; totalIn: number; totalOut: number };

/** Sankey: income sources → middle → spending. Copied from the overview's ReportsCard. */
export function Sankey({ flows, privacy, rangeText }: { flows: Flows; privacy: boolean; rangeText: string }) {
  const custom = useCustomColours();
  const SW = 1000;
  const GAP = 18;
  const NODE_W = 14;
  const MIN_SLOT = 40;
  const USABLE = 260;
  const total = Math.max(flows.totalIn, flows.totalOut) || 1;
  const px = (v: number) => Math.max(3, (v / total) * USABLE);
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
  const summary = privacy ? `Money in and out, ${rangeText}: amounts hidden`
    : `Money in, ${rangeText}: ${flows.sources.map((s) => `${s.label} ${aud(s.amount)}`).join(", ") || "none"}. Money out: ${flows.targets.map((t) => `${t.label} ${aud(t.amount)}`).join(", ") || "none"}.`;

  return (
    <figure className="rp-sankey" style={{ height: H }}>
      <svg viewBox={`0 0 ${SW} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary}>
        {left.map((s) => {
          const d = ribbon(NODE_W, s.y, s.y + s.h, midX, inCursor, inCursor + s.h);
          inCursor += s.h;
          return <path key={`l-${s.label}`} d={d} className="rp-ribbon" style={{ fill: dataColour("income") }} />;
        })}
        {right.map((t) => {
          const d = ribbon(midX + NODE_W, outCursor, outCursor + t.h, SW - NODE_W, t.y, t.y + t.h);
          outCursor += t.h;
          return <path key={`r-${t.label}`} d={d} className="rp-ribbon" style={{ fill: (t.label === "Everything else" ? dataColour("neutral") : catColour(t.label, custom)) }} />;
        })}
        {left.map((s) => <rect key={`ln-${s.label}`} x="0" y={s.y} width={NODE_W} height={s.h} rx="3" className="rp-node" style={{ fill: dataColour("income") }} />)}
        <rect x={midX} y={midY} width={NODE_W} height={midH} rx="3" className="rp-node" />
        {right.map((t) => <rect key={`rn-${t.label}`} x={SW - NODE_W} y={t.y} width={NODE_W} height={t.h} rx="3" className="rp-node" style={{ fill: (t.label === "Everything else" ? dataColour("neutral") : catColour(t.label, custom)) }} />)}
      </svg>
      {left.map((s) => (
        <span key={`lt-${s.label}`} className="rp-sk-label rp-sk-label--l" style={{ top: s.y + s.h / 2 }}>
          <b>{s.label}</b><span className="mh-amount">{aud(s.amount)} ({s.pct.toFixed(1)}%)</span>
        </span>
      ))}
      {right.map((t) => (
        <span key={`rt-${t.label}`} className="rp-sk-label rp-sk-label--r" style={{ top: t.y + t.h / 2 }}>
          <b>{t.label}</b><span className="mh-amount">{aud(t.amount)} ({t.pct.toFixed(1)}%)</span>
        </span>
      ))}
      {left.length === 0 && <span className="rp-sk-label rp-sk-label--l" style={{ top: H / 2 }}><b>No income recorded</b></span>}
      {right.length === 0 && <span className="rp-sk-label rp-sk-label--r" style={{ top: H / 2 }}><b>No spending recorded</b></span>}
    </figure>
  );
}
