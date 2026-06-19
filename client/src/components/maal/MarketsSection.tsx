import { useEffect, useState } from "react";

import {
  getMarketIndices,
  getMarketNews,
  type IndexQuote,
  type NewsItem,
} from "@/lib/markets.functions";

function fmtPrice(v: number) {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(v);
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function MarketsSection() {
  const loadIndices = getMarketIndices;
  const loadNews = getMarketNews;
  const [indices, setIndices] = useState<IndexQuote[] | null>(null);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    async function refresh() {
      try {
        const r = await loadIndices();
        if (!stale) {
          setIndices(r.items);
          setUpdatedAt(r.updatedAt);
        }
      } catch (e) { console.warn("indices failed", e); }
    }
    async function refreshNews() {
      try {
        const r = await loadNews();
        if (!stale) setNews(r.items);
      } catch (e) { console.warn("news failed", e); }
    }
    refresh();
    refreshNews();
    const a = setInterval(refresh, 60_000);
    const b = setInterval(refreshNews, 5 * 60_000);
    return () => { stale = true; clearInterval(a); clearInterval(b); };
  }, [loadIndices, loadNews]);

  return (
    <section aria-labelledby="markets-heading" className="mt-10">
      <div className="flex items-baseline justify-between mb-4">
        <h2
          id="markets-heading"
          className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground"
        >
          Markets
        </h2>
        {updatedAt && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            Updated {timeAgo(updatedAt)} · auto-refresh 60s
          </span>
        )}
      </div>

      <div className="grid lg:grid-cols-5 gap-3">
        <div className="lg:col-span-3 p-5 border border-border rounded-[12px] bg-[var(--surface)]">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
            Global indices
          </p>
          {!indices ? (
            <div className="grid sm:grid-cols-2 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[58px] rounded-[10px] bg-[var(--secondary)] animate-pulse" />
              ))}
            </div>
          ) : indices.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Live quotes unavailable right now.</p>
          ) : (
            <ul className="grid sm:grid-cols-2 gap-2">
              {indices.map((q) => {
                const up = q.change >= 0;
                return (
                  <li
                    key={q.symbol}
                    className="flex items-center justify-between p-3 rounded-[10px] bg-background border border-border"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold truncate">{q.name}</p>
                      <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                        {q.region} · {q.currency}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[14px] font-bold tabular-nums">{fmtPrice(q.price)}</p>
                      <p
                        className={`text-[11px] tabular-nums font-semibold ${
                          up ? "text-[var(--mint)]" : "text-foreground"
                        }`}
                      >
                        {up ? "▲" : "▼"} {fmtPrice(Math.abs(q.change))} ({up ? "+" : "−"}
                        {Math.abs(q.changePct).toFixed(2)}%)
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-[10px] text-muted-foreground">
            Quotes sourced from Yahoo Finance; may be delayed up to 20 minutes.
          </p>
        </div>

        <div className="lg:col-span-2 p-5 border border-border rounded-[12px] bg-[var(--surface)]">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
            Market news
          </p>
          {!news ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-[52px] rounded-[10px] bg-[var(--secondary)] animate-pulse" />
              ))}
            </div>
          ) : news.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No headlines available right now.</p>
          ) : (
            <ul className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {news.map((n, i) => (
                <li key={i}>
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded-[10px] border border-border bg-background hover:border-foreground/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
                  >
                    <p className="text-[13px] font-medium leading-snug line-clamp-2">{n.title}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      {n.source} · {timeAgo(n.publishedAt)}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}