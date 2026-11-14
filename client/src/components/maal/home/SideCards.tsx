import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { MaalScore } from "@/lib/maalScore";
import { getMarketIndices } from "@/lib/markets.functions";
import { AskSparkButton, HomeCard } from "./HomeCard";

/** Maal Score summary — the single 0–100 composite, with its pillars. */
export function MaalScoreCard({ score, error }: { score: MaalScore | null; error?: boolean }) {
  return (
    <HomeCard label="Maal Score" to="/app/action-plan" labelId="mh-score-label"
      actions={score?.hasData ? <AskSparkButton label="Ask Maal how to lift your score" question="What are the two most useful things I could do to lift my Maal Score?" /> : undefined}>
      {!score ? (
        error ? <p className="mh-muted mh-small m-0">Your score couldn’t load right now.</p>
          : <div className="mh-skel" style={{ height: 64 }} />
      ) : !score.hasData ? (
        <>
          <p className="mh-serif-title" style={{ fontSize: 22 }}>Get your Maal Score.</p>
          <p className="mh-muted mh-small mt-2">Add your income, super and balances for a score out of 100 and a plan to lift it.</p>
          <Link to="/app/onboarding" className="mh-btn-ink mh-btn-ink--block mt-4">Add my details</Link>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <p className="mh-big m-0">{Math.round(score.score)}</p>
            <span className="mh-muted">of 100</span>
            {score.band && <span className="mh-badge ml-auto">{score.band}</span>}
          </div>
          <div className="mh-bar mt-4" role="img" aria-label={`Maal Score ${Math.round(score.score)} out of 100`}>
            <i style={{ width: `${Math.max(0, Math.min(100, score.score))}%` }} />
          </div>
          {score.pillars.length > 0 && (
            <ul className="list-none m-0 p-0 mt-5 space-y-2.5">
              {score.pillars.slice(0, 5).map((p) => {
                const pct = Math.max(0, Math.min(100, Number(p.score) || 0));
                return (
                  <li key={p.key ?? p.label} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center mh-small">
                    <span className="truncate">{p.label}</span>
                    <span className="mh-muted tabular-nums">{Math.round(pct)}</span>
                    <span className="mh-bar col-span-2" style={{ height: 6 }}><i style={{ width: `${pct}%` }} /></span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </HomeCard>
  );
}

type Index = { symbol: string; name: string; price: number; changePercent: number; currency?: string; isProxy?: boolean };

/** Market watch — live index moves from the existing markets endpoint. */
export function MarketWatchCard() {
  const [items, setItems] = useState<Index[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    getMarketIndices()
      .then((r: unknown) => setItems((Array.isArray(r) ? r : []).filter((x: any) => x && x.price != null) as Index[]))
      .catch(() => setError(true));
  }, []);

  return (
    <HomeCard label="Market watch" to="/app/research" labelId="mh-mkt-label"
      actions={<AskSparkButton label="Ask Maal about today’s markets" question="What's moving markets today and does any of it matter for my portfolio?" />}>
      {error ? (
        <p className="mh-muted mh-small m-0">Market data is unavailable right now. Check back shortly.</p>
      ) : !items ? (
        <div className="space-y-3">{[0, 1, 2].map((k) => <div key={k} className="mh-skel" style={{ height: 40 }} />)}</div>
      ) : items.length === 0 ? (
        <p className="mh-muted mh-small m-0">No market data right now.</p>
      ) : (
        <>
          <ul className="list-none m-0 p-0">
            {items.slice(0, 5).map((i) => {
              const up = i.changePercent >= 0;
              const Arrow = up ? ArrowUpRight : ArrowDownRight;
              return (
                <li key={i.symbol} className="mh-mkt">
                  <div className="mh-mkt-row">
                    <span className="truncate">{i.name}</span>
                    <span className="tabular-nums">{Number(i.price).toLocaleString("en-AU", { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="mh-mkt-sub">
                    <span>{i.symbol}{i.currency ? ` · ${i.currency}` : ""}</span>
                    <span className="inline-flex items-center gap-0.5 tabular-nums" style={{ color: up ? "var(--mh-good)" : "var(--mh-bad)" }}>
                      {Math.abs(i.changePercent).toFixed(2)}% <Arrow className="size-3" aria-label={up ? "up" : "down"} />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {items.some((i) => i.isProxy) && (
            <p className="mh-faint mt-3 m-0" style={{ fontSize: 11 }}>Some figures are ETF prices in USD used as index proxies, not index levels.</p>
          )}
        </>
      )}
    </HomeCard>
  );
}
