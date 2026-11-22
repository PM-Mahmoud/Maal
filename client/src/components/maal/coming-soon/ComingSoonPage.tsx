import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, X } from "lucide-react";
import { COMING_SOON, type ComingSoonFeature, type ComingSoonKey, type Faq, type Preview } from "./features";
import { hasNotified, registerServiceInterest, rememberNotified } from "./interest";
import "../nav/nav.css";
import "./coming-soon.css";

/**
 * One "Coming soon" page for every feature that isn't live yet (v3, 2026-11-23):
 * a tall textured hero (optional photo at /app/images/coming-soon/<key>.jpg over
 * a CSS texture fallback) with a Lora headline, a white "Coming soon" button
 * that registers interest, and a frosted example card; then Benefits, an
 * optional comparison table, an FAQ row and fine print.
 */
export function ComingSoonPage({ feature }: { feature: ComingSoonKey }) {
  const f = COMING_SOON[feature];
  const interest = useInterest(f);
  return (
    <div className="cs-root">
      <header className="mn-tabs cs-head">
        <h1 className="mn-tabs-title cs-title">{f.title}</h1>
      </header>
      <div className="cs-body">
        <Hero f={f} interest={interest} />
        <Benefits f={f} />
        {f.table && <ComparisonTable table={f.table} />}
        <FaqRow id={`cs-${f.key}-faq`} faqs={f.faqs} />
        <p className="cs-fine">
          Coming soon features aren't available yet. Details, providers and pricing may change before launch.
          Maal does not provide financial advice.{" "}
          <span className="cs-credit">
            Photo:{" "}
            <a href={f.photo.credit.url} target="_blank" rel="noopener noreferrer">{f.photo.credit.name} / Unsplash</a>
          </span>
        </p>
      </div>
    </div>
  );
}

type Interest = { state: "idle" | "sending" | "done"; notify: () => void };

function useInterest(f: ComingSoonFeature): Interest {
  const [state, setState] = useState<Interest["state"]>("idle");
  // Read after mount so the first render and storage-less browsers agree.
  useEffect(() => { setState(hasNotified(f.key) ? "done" : "idle"); }, [f.key]);
  const notify = useCallback(async () => {
    if (state !== "idle") return;
    setState("sending");
    try {
      await registerServiceInterest(f.key);
      rememberNotified(f.key);
      setState("done");
      toast.success(`Thanks. We'll let you know when ${f.title} is ready.`);
    } catch (e) {
      setState("idle");
      toast.error(e instanceof Error ? e.message : "Couldn't save that. Please try again.");
    }
  }, [f.key, f.title, state]);
  return { state, notify };
}

function SoonButton({ interest, className = "" }: { interest: Interest; className?: string }) {
  const { state, notify } = interest;
  return (
    <button type="button" className={`cs-btn ${className}`} onClick={notify} disabled={state !== "idle"}>
      {state === "done" ? "We'll let you know" : state === "sending" ? "Saving…" : "Coming soon"}
    </button>
  );
}

/** Hero photos ship from client/public (served under /app). */
const photoUrl = (key: string, w?: 900) => `/app/images/coming-soon/${key}${w ? `-${w}` : ""}.jpg`;

function Hero({ f, interest }: { f: ComingSoonFeature; interest: Interest }) {
  // The CSS texture sits underneath and shows on its own if the photo fails.
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setPhotoFailed(false), [f.key]);
  // Session and plan cards carry their own "Coming soon" buttons.
  const cardsHaveButtons = f.preview.kind === "sessions" || f.preview.kind === "plans";
  const style = { "--m-base": f.mood.base, "--m-a": f.mood.a, "--m-b": f.mood.b, "--m-c": f.mood.c } as CSSProperties;
  return (
    <section className="cs-hero" data-photo={photoFailed ? undefined : "true"} style={style} aria-labelledby={`cs-${f.key}-headline`}>
      <div className="cs-hero-bg" aria-hidden />
      {!photoFailed && (
        <img
          key={f.key}
          className="cs-hero-photo"
          src={photoUrl(f.key)}
          srcSet={`${photoUrl(f.key, 900)} 900w, ${photoUrl(f.key)} 1600w`}
          sizes="(min-width: 768px) calc(100vw - 300px), 100vw"
          width={f.photo.width}
          height={f.photo.height}
          alt=""
          loading="eager"
          fetchPriority="high"
          decoding="async"
          style={f.photo.position ? { objectPosition: f.photo.position } : undefined}
          onError={() => setPhotoFailed(true)}
        />
      )}
      <div className="cs-hero-scrim" aria-hidden />
      <div className="cs-hero-inner">
        <h2 id={`cs-${f.key}-headline`} className="cs-headline">
          <em>{f.headline.italic}</em> {f.headline.rest}
        </h2>
        <p className="cs-lines"><span>{f.lines[0]}</span> <span>{f.lines[1]}</span></p>
        {cardsHaveButtons ? (
          <>
            <PreviewCards preview={f.preview} interest={interest} />
            <p className="cs-reassure">{f.reassurance}</p>
          </>
        ) : (
          <>
            <SoonButton interest={interest} />
            <p className="cs-reassure">{f.reassurance}</p>
            <PreviewCards preview={f.preview} interest={interest} />
          </>
        )}
      </div>
    </section>
  );
}

function GlassHead({ label }: { label: string }) {
  return (
    <div className="cs-glass-head">
      <span className="cs-label cs-glass-label">{label}</span>
      <span className="cs-example">Example</span>
    </div>
  );
}

function PreviewCards({ preview: p, interest }: { preview: Preview; interest: Interest }) {
  switch (p.kind) {
    case "credit":
      return (
        <div className="cs-glass cs-glass-sm">
          <GlassHead label="Credit score" />
          <div className="cs-glass-body">
            <div className="cs-score-row"><span className="cs-score">{p.score}</span><span className="cs-muted-w">{p.band}</span></div>
            <div className="cs-segs" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="cs-seg" data-on={i === p.marker ? "true" : undefined}>
                  {i === p.marker && <small>You</small>}
                </span>
              ))}
            </div>
            <p className="cs-change"><strong>{p.change.split(" ")[0]}</strong> {p.change.split(" ").slice(1).join(" ")}</p>
          </div>
        </div>
      );
    case "equity":
      return (
        <div className="cs-glass cs-glass-sm">
          <GlassHead label="Portfolio" />
          <div className="cs-glass-body">
            <div className="cs-company"><span className="cs-logo" aria-hidden>{p.company[0]}</span>{p.company}</div>
            <dl className="cs-kv">
              <div><dt>Latest share price</dt><dd>{p.price}</dd></div>
              <div><dt>Last valuation</dt><dd>{p.valuation}</dd></div>
            </dl>
            {p.grants.map((g) => (
              <div key={g.name} className="cs-grant">
                <span className="cs-grant-name">{g.name} <span className="cs-tag">{g.type}</span></span>
                <span className="cs-grant-nums">{g.total}<small>{g.vested}</small></span>
              </div>
            ))}
          </div>
        </div>
      );
    case "sessions":
      return (
        <div className="cs-glass-row">
          {p.sessions.map((s) => (
            <div key={s.length} className="cs-glass cs-plan">
              <GlassHead label="Session" />
              <div className="cs-glass-body cs-session">
                <span className="cs-session-len">{s.length}</span>
                <span className="cs-price-note">Pricing shared before launch</span>
                <p className="cs-session-blurb">{s.blurb}</p>
                <ul className="cs-ticks">
                  {s.points.map((pt) => <li key={pt}><CircleCheck aria-hidden strokeWidth={1.6} />{pt}</li>)}
                </ul>
                <SoonButton interest={interest} className="cs-btn-block" />
              </div>
            </div>
          ))}
        </div>
      );
    case "plans":
      return (
        <div className="cs-glass-row cs-glass-row-3">
          {p.plans.map((pl) => (
            <div key={pl.name} className="cs-glass cs-plan">
              <GlassHead label="Plan" />
              <div className="cs-glass-body">
                <div className="cs-plan-name">{pl.name}</div>
                <p className="cs-plan-blurb">{pl.blurb}</p>
                <ul className="cs-ticks">
                  {pl.points.map((pt) => (
                    <li key={pt.label} data-off={pt.included ? undefined : "true"}>
                      {pt.included ? <Check aria-hidden strokeWidth={1.6} /> : <X aria-hidden strokeWidth={1.6} />}
                      <span>{pt.label}<span className="sr-only">{pt.included ? " (included)" : " (not included)"}</span></span>
                    </li>
                  ))}
                </ul>
                <span className="cs-price-note">Pricing shared before launch</span>
                <SoonButton interest={interest} className="cs-btn-block" />
              </div>
            </div>
          ))}
        </div>
      );
    case "tax":
      return (
        <div className="cs-glass cs-glass-sm">
          <GlassHead label="Tax time" />
          <div className="cs-glass-body">
            <p className="cs-muted-w cs-small">{p.year}</p>
            <dl className="cs-kv cs-kv-rows">
              {p.rows.map((r) => <div key={r.label} data-strong={r.strong ? "true" : undefined}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}
            </dl>
            <p className="cs-muted-w cs-small">{p.note}</p>
          </div>
        </div>
      );
    case "id":
      return (
        <div className="cs-glass cs-glass-sm">
          <GlassHead label="Monitoring" />
          <ul className="cs-glass-body cs-idlist">
            {p.rows.map((r) => (
              <li key={r.item} data-alert={r.alert ? "true" : undefined}>
                {r.alert ? <CircleAlert aria-hidden strokeWidth={1.6} /> : <CircleCheck aria-hidden strokeWidth={1.6} />}
                <span className="cs-id-item">{r.item}</span>
                <span className="cs-id-status">{r.status}</span>
              </li>
            ))}
          </ul>
        </div>
      );
  }
}

function Benefits({ f }: { f: ComingSoonFeature }) {
  return (
    <section className="cs-panel" aria-labelledby={`cs-${f.key}-benefits`}>
      <h2 id={`cs-${f.key}-benefits`} className="cs-label cs-panel-label">Benefits</h2>
      <ul className="cs-benefits">
        {f.benefits.map(({ icon: Icon, title, text }) => (
          <li key={title} className="cs-benefit">
            <span className="cs-benefit-icon"><Icon aria-hidden strokeWidth={1.6} /></span>
            <div>
              <h3 className="cs-benefit-title">{title}</h3>
              <p className="cs-benefit-text">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ComparisonTable({ table }: { table: NonNullable<ComingSoonFeature["table"]> }) {
  return (
    <section className="cs-panel cs-table-panel" aria-label="Plan comparison">
      <div className="cs-table-scroll">
        <table className="cs-table">
          {table.sections.map((s) => (
            <tbody key={s.label}>
              <tr className="cs-table-head">
                <th scope="col" className="cs-label">{s.label}</th>
                {table.columns.map((c) => <th key={c} scope="col" className="cs-label cs-col">{c}</th>)}
              </tr>
              {s.rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  {r.cells.map((on, i) => (
                    <td key={i} className="cs-col" data-on={on ? "true" : undefined}>
                      {on ? <Check aria-label="Included" strokeWidth={1.8} /> : <X aria-label="Not included" strokeWidth={1.6} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}

/** FAQ cards in a row; scrolls inside its own container, with prev/next arrows. */
function FaqRow({ id, faqs }: { id: string; faqs: Faq[] }) {
  const rowRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const update = () => setEdges({
      start: el.scrollLeft <= 1,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => { el.removeEventListener("scroll", update); ro?.disconnect(); };
  }, []);

  const step = (dir: 1 | -1) => {
    const el = rowRef.current;
    if (el) el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <section className="cs-panel" aria-labelledby={id}>
      <h2 id={id} className="cs-label cs-panel-label">FAQ</h2>
      <ul ref={rowRef} className="cs-faqs">
        {faqs.map((faq, i) => {
          const isOpen = open === i;
          const answerId = `${id}-a${i}`;
          return (
            <li key={faq.q} className="cs-faq">
              <h3 className="cs-faq-q">{faq.q}</h3>
              <p id={answerId} className="cs-faq-a" hidden={!isOpen}>{faq.a}</p>
              <button type="button" className="cs-more" aria-expanded={isOpen} aria-controls={answerId}
                onClick={() => setOpen(isOpen ? null : i)}>
                {isOpen ? "Show less" : "Read more"} <ArrowUpRight aria-hidden strokeWidth={1.6} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="cs-arrows">
        <button type="button" className="cs-arrow" onClick={() => step(-1)} disabled={edges.start} aria-label="Previous questions">
          <ChevronLeft aria-hidden strokeWidth={1.6} />
        </button>
        <button type="button" className="cs-arrow" onClick={() => step(1)} disabled={edges.end} aria-label="More questions">
          <ChevronRight aria-hidden strokeWidth={1.6} />
        </button>
      </div>
    </section>
  );
}
