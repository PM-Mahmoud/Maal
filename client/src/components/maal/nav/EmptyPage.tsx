import "./nav.css";

/**
 * Placeholder page for sections whose Figma designs are not final yet
 * (2026-11-15). Title, one muted line and the mandatory disclaimer only.
 */
export function EmptyPage({ title }: { title: string }) {
  return (
    <div className="mn-empty">
      <div className="mn-empty-inner">
        <h1 className="mn-empty-title">{title}</h1>
        <p className="mn-empty-text">This page is being designed. Check back soon.</p>
      </div>
      <p className="mn-empty-disclaimer">
        Maal does not provide financial advice. Any information provided by Maal is for educational purposes only.
        You should do your own research. Investing is risky and you can lose all of your money.
      </p>
    </div>
  );
}
