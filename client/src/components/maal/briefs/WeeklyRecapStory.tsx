import { useQuery } from "@tanstack/react-query";
import { aud, briefKeys, getWeeklyRecap, type WeeklyRecap } from "./api";
import { StoryCover, StorySkeleton, StoryState, StoryViewer, type StorySlide } from "./StoryViewer";
import { BriefDisclaimer, DiveDeeperButton, FeedbackButtons, TrendChart } from "./parts";

function Meta({ left, right }: { left: string; right: string }) {
  return (
    <div className="mb-meta">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

function Body({ lines }: { lines: string[] }) {
  return <>{lines.map((l, i) => <p key={i} className="mb-text">{l}</p>)}</>;
}

function signedPct(n: number | null) {
  if (n == null) return "";
  return `${n > 0 ? "+" : n < 0 ? "-" : "+"}${Math.abs(n).toFixed(2)}%`;
}

function buildSlides(r: WeeklyRecap): StorySlide[] {
  const range = r.period.label.toUpperCase();
  const period = r.period.start;
  const nw = r.netWorth;
  const sp = r.spending;
  const cf = r.cashFlow;
  const g = r.goals;
  const flowMax = Math.max(cf.moneyIn, cf.moneyOut, 1);

  return [
    {
      key: "cover",
      background: "recap",
      content: <StoryCover title="Your weekly recap" subtitle={r.period.label} />,
    },
    {
      key: "net-worth",
      content: (
        <>
          <Meta left="Net worth" right={range} />
          <h2 className="mb-title">{nw.copy.title}</h2>
          {nw.hasData && nw.closing != null ? (
            <div className="mb-panel">
              <p className="mb-panel-label">Net worth</p>
              <div className="mb-figure">
                <strong>{aud(nw.closing, 0)}</strong>
                <span className={nw.direction === "up" ? "up" : nw.direction === "down" ? "down" : ""}>
                  {signedPct(nw.changePct ?? 0)}
                </span>
              </div>
              <TrendChart values={nw.series.map((p) => p.value)} label={`Net worth from ${aud(nw.opening ?? 0, 0)} to ${aud(nw.closing, 0)}`} />
            </div>
          ) : null}
          <Body lines={nw.copy.body} />
          <FeedbackButtons brief="weekly_recap" slide="net_worth" period={period} />
        </>
      ),
    },
    {
      key: "spending",
      content: (
        <>
          <Meta left="Spending" right={range} />
          <h2 className="mb-title">{sp.copy.title}</h2>
          {sp.hasData ? (
            <div className="mb-panel">
              <p className="mb-panel-label">Spent this week</p>
              <div className="mb-figure">
                <strong>{aud(sp.total)}</strong>
                {sp.previousTotal > 0 ? <span>vs {aud(sp.previousTotal)} last week</span> : null}
              </div>
              <div className="mb-cats">
                {sp.categories.map((c) => (
                  <div className="mb-cat-row" key={c.group}>
                    <span>{c.group}</span>
                    <span className="amt">{aud(c.amount)}</span>
                    <div className="mb-cat-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, c.share)}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <Body lines={sp.copy.body} />
          <FeedbackButtons brief="weekly_recap" slide="spending" period={period} />
        </>
      ),
    },
    {
      key: "cash-flow",
      content: (
        <>
          <Meta left="Money in and out" right={range} />
          <h2 className="mb-title">{cf.copy.title}</h2>
          {cf.hasData ? (
            <div className="mb-panel">
              <p className="mb-panel-label">Cash flow</p>
              <div className="mb-figure">
                <strong>{cf.net >= 0 ? "+" : "-"}{aud(Math.abs(cf.net))}</strong>
                <span>net for the week</span>
              </div>
              <div className="mb-flow">
                <div className="mb-flow-row">
                  <span>Money in</span>
                  <div className="bar" aria-hidden="true"><i className="in" style={{ width: `${(cf.moneyIn / flowMax) * 100}%` }} /></div>
                  <span className="amt">{aud(cf.moneyIn)}</span>
                </div>
                <div className="mb-flow-row">
                  <span>Money out</span>
                  <div className="bar" aria-hidden="true"><i className="out" style={{ width: `${(cf.moneyOut / flowMax) * 100}%` }} /></div>
                  <span className="amt">{aud(cf.moneyOut)}</span>
                </div>
              </div>
            </div>
          ) : null}
          <Body lines={cf.copy.body} />
          <FeedbackButtons brief="weekly_recap" slide="cash_flow" period={period} />
        </>
      ),
    },
    {
      key: "goals",
      content: (
        <>
          <Meta left="Goals" right={range} />
          <h2 className="mb-title">{g.copy.title}</h2>
          {g.hasData ? (
            <div className="mb-panel">
              <p className="mb-panel-label">{g.count} goal{g.count === 1 ? "" : "s"}</p>
              {g.items.map((goal) => (
                <div className="mb-goal" key={goal.name}>
                  <div className="mb-goal-head">
                    <strong style={{ fontWeight: 400 }}>{goal.name}</strong>
                    <span>{aud(goal.current, 0)} of {aud(goal.target, 0)}</span>
                  </div>
                  <div className="mb-cat-bar" aria-label={`${Math.round(goal.progressPct)}% complete`}>
                    <i className={goal.reached ? "done" : ""} style={{ width: `${Math.max(2, goal.progressPct)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <Body lines={g.copy.body} />
          <FeedbackButtons brief="weekly_recap" slide="goals" period={period} />
        </>
      ),
    },
    {
      key: "dive-deeper",
      background: "recap",
      content: (
        <StoryCover title="Want to learn more?" subtitle="Ask a follow-up and keep exploring." footer={<BriefDisclaimer />}>
          <DiveDeeperButton question={`Walk me through my week from ${r.period.label}: what changed in my net worth and spending, and what should I keep an eye on?`} />
        </StoryCover>
      ),
    },
  ];
}

/** The weekly recap story (Figma: Weekly recap from Home). */
export function WeeklyRecapStory({ onClose }: { onClose: () => void }) {
  const q = useQuery({ queryKey: briefKeys.recap, queryFn: getWeeklyRecap, staleTime: 10 * 60 * 1000 });

  let slides: StorySlide[];
  if (q.data) {
    slides = buildSlides(q.data);
  } else {
    slides = [
      { key: "cover", background: "recap", content: <StoryCover title="Your weekly recap" subtitle={q.isError ? "" : "Gathering your week…"} /> },
      {
        key: "state",
        content: q.isError ? (
          <StoryState>
            <p>We couldn’t load your recap just now.</p>
            <button type="button" className="mb-retry" onClick={() => q.refetch()}>Try again</button>
          </StoryState>
        ) : (
          <StorySkeleton />
        ),
      },
    ];
  }

  return <StoryViewer slides={slides} label="Your weekly recap" onClose={onClose} />;
}
