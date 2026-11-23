import { useEffect, useRef, useState } from "react";
import { mountCollapsingMark } from "../../../../../shared/collapsing-mark.mjs";

/**
 * The 404 page's Maal mark, built from bricks that tumble down and rebuild
 * (shared/collapsing-mark.mjs does the drawing and the loop, the same code the
 * server-rendered page uses). Click it, or hover the fallen pile, to rebuild.
 * With reduced motion it shows one still frame: most of the M standing and a
 * few bricks on the floor. Bricks use currentColor, so it follows the theme.
 */
export function CollapsingMark({ className = "" }: { className?: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let cleanup = () => {};
    const mount = () => {
      cleanup();
      const reduced = !!mq?.matches;
      setStill(reduced);
      if (svg.current && btn.current) {
        cleanup = mountCollapsingMark(svg.current, { reducedMotion: reduced, target: btn.current });
      }
    };
    mount();
    mq?.addEventListener?.("change", mount);
    return () => {
      mq?.removeEventListener?.("change", mount);
      cleanup();
    };
  }, []);

  return (
    <button
      ref={btn}
      type="button"
      className={`nf-mark ${className}`}
      data-still={still ? "" : undefined}
      tabIndex={still ? -1 : 0}
      aria-label={still ? "The Maal logo with a few blocks fallen off" : "The Maal logo, built from blocks that fall apart and rebuild. Press to rebuild it."}
    >
      <svg ref={svg} aria-hidden="true" focusable="false" />
    </button>
  );
}
