import { useQuery } from "@tanstack/react-query";
import { briefKeys, getMarketBrief, relativeUpdated, type MarketBrief } from "./api";
import { StoryCover, StorySkeleton, StoryState, StoryViewer, type StorySlide } from "./StoryViewer";
import { BriefDisclaimer, DiveDeeperButton, FeedbackButtons, TrendChart } from "./parts";

const UP = "#139E7D";
const DOWN = "#ED555B";
const FLAT = "#5DB7E8";

export function briefDateLabel(iso: string) {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function Change({ value }: { value: number | null }) {
  if (value == null) return <span className="chg na">No data</span>;
  const cls = value > 0 ? "up" : value < 0 ? "down" : "";
  return <span className={`chg ${cls}`}>{Math.abs(value).toFixed(2)}% {value > 0 ? "↗" : value < 0 ? "↘" : "→"}</span>;
}

function colourFor(v: number | null) {
  if (v == null || v === 0) return FLAT;
  return v > 0 ? UP : DOWN;
}

function buildSlides(b: MarketBrief): StorySlide[] {
  const updated = relativeUpdated(b.generatedAt).toUpperCase();
  const rows = [
    ...b.indices.filter((i) => i.changePercent != null).map((i) => ({ key: i.symbol, label: i.label, sub: i.symbol, change: i.changePercent, series: i.series })),
    ...(b.aud ? [{ key: "AUDUSD", label: "Australian dollar", sub: `US${(b.aud.rate * 100).toFixed(2)}c`, change: b.aud.changePercent, series: b.aud.series }] : []),
  ];
  const ahead = b.lookingAhead || [];

  const slides: StorySlide[] = [
    {
      key: "cover",
      background: "market",
      content: <StoryCover title="Daily market brief" subtitle={briefDateLabel(b.date)} />,
    },
    {
      key: "story",
      content: (
        <>
          <div className="mb-meta"><span>Today’s market story</span><span>{updated}</span></div>
          <h2 className="mb-title sm">{b.headline}</h2>
          {b.story[0] ? <p className="mb-text">{b.story[0]}</p> : null}
          {rows.length ? (
            <div className="mb-panel" style={{ paddingTop: 20 }}>
              {rows.map((r) => (
                <div className="mb-index" key={r.key}>
                  {r.series.length >= 2 ? (
                    <TrendChart values={r.series} color={colourFor(r.change)} height={46} showGrid={false} showPoint={false} label={`${r.label} recent trend`} />
                  ) : null}
                  <div className="mb-index-row">
                    <span>{r.label}</span>
                    <span className="sub">• {r.sub}</span>
                    <Change value={r.change} />
                  </div>
                </div>
              ))}
              <p className="mb-note">
                Share markets shown via US-listed ETFs (% change in USD) for the latest session. The Australian dollar uses the ECB daily reference rate.
              </p>
            </div>
          ) : null}
          {b.story.slice(1).map((p, i) => <p className="mb-text" key={i}>{p}</p>)}
          {b.outlook ? <p className="mb-text">{b.outlook}</p> : null}
          <FeedbackButtons brief="market_brief" slide="story" period={b.date} />
          {b.sources.length ? (
            <p className="mb-sources">
              Sources:{" "}
              {b.sources.slice(0, 5).map((s, i) => (
                <span key={s.url || i}>
                  {i ? ", " : ""}
                  {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.source || s.title}</a> : (s.source || s.title)}
                </span>
              ))}
            </p>
          ) : null}
        </>
      ),
    },
  ];

  if (ahead.length) {
    slides.push({
      key: "ahead",
      content: (
        <>
          <div className="mb-meta"><span>Looking ahead</span><span>{updated}</span></div>
          {ahead.map((e, i) => (
            <div className="mb-event" key={i}>
              <h3>{e.date ? `${e.date}: ` : ""}{e.title}</h3>
              <p>{e.body}</p>
            </div>
          ))}
          <FeedbackButtons brief="market_brief" slide="looking_ahead" period={b.date} />
        </>
      ),
    });
  }

  slides.push({
    key: "dive-deeper",
    background: "market",
    content: (
      <StoryCover title="Want to learn more?" subtitle="Ask a follow-up and keep exploring." footer={<BriefDisclaimer />}>
        <DiveDeeperButton question={`Today's market brief says: "${b.headline}". What does this mean for everyday Australian investors, and how could it relate to my portfolio and super?`} />
      </StoryCover>
    ),
  });
  return slides;
}

/** The daily market brief story (Figma: Daily market brief from Home). */
export function MarketBriefStory({ onClose }: { onClose: () => void }) {
  const q = useQuery({ queryKey: briefKeys.market, queryFn: getMarketBrief, staleTime: 30 * 60 * 1000 });

  let slides: StorySlide[];
  if (q.data) {
    slides = buildSlides(q.data);
  } else {
    slides = [
      { key: "cover", background: "market", content: <StoryCover title="Daily market brief" subtitle={q.isError ? "" : "Checking today’s markets…"} /> },
      {
        key: "state",
        content: q.isError ? (
          <StoryState>
            <p>We couldn’t load today’s brief just now.</p>
            <button type="button" className="mb-retry" onClick={() => q.refetch()}>Try again</button>
          </StoryState>
        ) : (
          <StorySkeleton />
        ),
      },
    ];
  }

  return <StoryViewer slides={slides} label="Daily market brief" onClose={onClose} />;
}
