// shared/collapsing-mark.mjs — the 404 page's animated Maal mark (HEL-110).
//
// The real 7×7 pixel-grid "M" (client/src/components/maal/MaalMark.tsx) rebuilt
// as 19 bricks. Loop (LOOP seconds): the M stands assembled, the top bricks
// loosen and tumble down with gravity, a little spin and a bounce, and pile up
// on a floor line while the lower parts of both legs stay standing; then every
// brick flies back and the M is whole again.
//
// One implementation for both pages: the React page (CollapsingMark.tsx) and
// the server-rendered page (views/not-found.ejs, served to the browser at
// /js/collapsing-mark.mjs) call mountCollapsingMark() on an empty <svg>.
// poseAt() is pure and deterministic (test/collapsing-mark.test.js).
// Bricks fill with currentColor, so the mark follows the theme.

const SVG_NS = "http://www.w3.org/2000/svg";

/** Grid units. The floor line is the bottom of the M. */
export const FLOOR = 7;
export const VIEWBOX = { x: -2.5, y: -1, w: 12, h: 8.8 };
export const LOOP = 7.2;

const BRICK = 0.9; // brick size; the 0.1 gap shows the joins
const REST_Y = FLOOR - BRICK / 2; // centre of a brick lying on the floor
const REST_Y2 = REST_Y - BRICK - 0.02; // centre of a brick lying on another one

const G = 30; // gravity, units/s²
const KICK = 2.6; // upward nudge as a brick comes loose
const HOLD = 1.3; // assembled, before the first brick falls
const LOOSEN = 0.35; // wobble just before falling
const STAGGER = 0.12; // between falling bricks
const BOUNCE = 0.22; // bounce height
const REBUILD_AT = 5.3;
const REBUILD_STAGGER = 0.07;
const REBUILD_DUR = 0.75;

// [col, row, rest] — rest is where a falling brick ends up: [x, y, angle°,
// spin°]. Bricks with no rest stay standing. Order = fall order (top first).
const LAYOUT = [
  [0, 0, [-0.95, REST_Y, 0, -270]],
  [6, 0, [7.4, REST_Y, 0, 180]],
  [1, 1, [2.65, REST_Y, 0, 90]],
  [5, 1, [4.85, REST_Y, 0, -90]],
  [0, 1, [1.55, REST_Y, 0, 180]],
  [6, 1, [8.55, REST_Y, 0, 90]],
  [2, 2, [2.1, REST_Y2, -7, -180]],
  [4, 2, [3.75, REST_Y, 0, 90]],
  [6, 2, [7.95, REST_Y2, 6, 180]],
  [3, 3, [4.3, REST_Y2, 9, -90]],
  // Standing: the lower parts of both legs, so the pile still hints at the M.
  [0, 2], [0, 3], [0, 4], [0, 5], [0, 6],
  [6, 3], [6, 4], [6, 5], [6, 6],
];

// Reduced motion: one still frame with most of the M standing and a few
// bricks fallen off the top right.
const STILL_FALLEN = new Map([
  ["6,0", [7.45, REST_Y, 0]],
  ["6,1", [8.6, REST_Y, 0]],
  ["5,1", [8.0, REST_Y2, 7]],
]);

export const BRICKS = LAYOUT.map(([col, row, rest], i) => ({
  id: `${col},${row}`,
  col, row,
  home: { x: col + 0.5, y: row + 0.5, rot: 0 },
  falls: !!rest,
  rest: rest ? { x: rest[0], y: rest[1], rot: rest[2] + rest[3] } : null,
  restAngle: rest ? rest[2] : 0,
  order: rest ? i : -1,
}));
const FALLERS = BRICKS.filter((b) => b.falls).length;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (p) => 1 - (1 - p) * (1 - p);
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
// Small overshoot so a returning brick snaps into place.
const easeOutBack = (p) => { const c = 1.4; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };

/** Seconds for a brick to drop `dy` units after the upward kick. */
function fallTime(dy) {
  return (KICK + Math.sqrt(KICK * KICK + 2 * G * dy)) / G;
}
const BOUNCE_T = 2 * Math.sqrt((2 * BOUNCE) / G);

/** When brick b starts falling and lands (seconds into the loop). */
export function fallWindow(b) {
  const start = HOLD + b.order * STAGGER;
  return { start, land: start + fallTime(b.rest.y - b.home.y) };
}

/**
 * Pose of a brick t seconds into the loop: centre x/y in grid units and
 * rotation in degrees. Standing bricks never move.
 */
export function poseAt(b, t) {
  if (!b.falls) return b.home;
  t = ((t % LOOP) + LOOP) % LOOP;
  const { start, land } = fallWindow(b);
  const { home, rest } = b;

  // Assembled; a slight wobble as the brick works loose.
  if (t < start) {
    const w = t - (start - LOOSEN);
    if (w <= 0) return home;
    const k = Math.sin(w * 55 + b.order) * (w / LOOSEN);
    return { x: home.x + k * 0.03, y: home.y, rot: k * 3 };
  }
  // Falling: kicked up a touch, then gravity; drifts sideways and spins.
  if (t < land) {
    const s = t - start;
    const p = s / (land - start);
    return {
      x: home.x + (rest.x - home.x) * easeOut(p),
      y: home.y - KICK * s + 0.5 * G * s * s,
      rot: rest.rot * easeOut(p),
    };
  }
  // One small bounce with a settling rock, then lying still.
  const rebuild = REBUILD_AT + (FALLERS - 1 - b.order) * REBUILD_STAGGER;
  if (t < rebuild) {
    const s = t - land;
    if (s < BOUNCE_T) {
      const v = (G * BOUNCE_T) / 2;
      const rock = Math.sin((s / BOUNCE_T) * Math.PI * 2) * 5 * (1 - s / BOUNCE_T);
      return { x: rest.x, y: rest.y - (v * s - 0.5 * G * s * s), rot: rest.rot + rock };
    }
    return rest;
  }
  // Rebuild: fly home along a gentle arc, last-fallen first.
  const p = clamp01((t - rebuild) / REBUILD_DUR);
  const e = easeOutBack(easeInOut(p) * 0.92 + p * 0.08);
  return {
    x: rest.x + (home.x - rest.x) * e,
    y: rest.y + (home.y - rest.y) * e - Math.sin(Math.PI * p) * 0.9,
    rot: rest.rot * (1 - e),
  };
}

/** The still frame shown when the viewer prefers reduced motion. */
export function stillPose(b) {
  const f = STILL_FALLEN.get(b.id);
  return f ? { x: f[0], y: f[1], rot: f[2] } : b.home;
}

/** True between the last landing and the start of the rebuild. */
export function isResting(t) {
  t = ((t % LOOP) + LOOP) % LOOP;
  const lastLand = Math.max(...BRICKS.filter((b) => b.falls).map((b) => fallWindow(b).land)) + BOUNCE_T;
  return t >= lastLand && t < REBUILD_AT;
}

const fmt = (n) => Math.round(n * 1000) / 1000;
function transformOf(p) {
  return `translate(${fmt(p.x)} ${fmt(p.y)}) rotate(${fmt(p.rot)})`;
}

function brickNode(doc) {
  const g = doc.createElementNS(SVG_NS, "g");
  const h = BRICK / 2;
  const body = doc.createElementNS(SVG_NS, "rect");
  body.setAttribute("x", String(-h));
  body.setAttribute("y", String(-h));
  body.setAttribute("width", String(BRICK));
  body.setAttribute("height", String(BRICK));
  body.setAttribute("rx", "0.07");
  // A stud on top, like a building brick. It only shows where nothing sits on it.
  const stud = doc.createElementNS(SVG_NS, "rect");
  stud.setAttribute("x", "-0.23");
  stud.setAttribute("y", String(-h - 0.11));
  stud.setAttribute("width", "0.46");
  stud.setAttribute("height", "0.14");
  stud.setAttribute("rx", "0.04");
  g.append(body, stud);
  return g;
}

/**
 * Build the bricks inside `svg` and run the loop. Returns a cleanup function.
 * options.reducedMotion: draw the still frame only (no animation, no clicks).
 * options.interactive (default true): clicking collapses an assembled mark or
 * rebuilds the pile; hovering the pile rebuilds it.
 */
export function mountCollapsingMark(svg, options = {}) {
  const doc = svg.ownerDocument;
  const win = doc.defaultView;
  const { x, y, w, h } = VIEWBOX;
  svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
  svg.replaceChildren();

  const floor = doc.createElementNS(SVG_NS, "line");
  floor.setAttribute("x1", String(x + 0.4));
  floor.setAttribute("x2", String(x + w - 0.4));
  floor.setAttribute("y1", String(FLOOR + 0.03));
  floor.setAttribute("y2", String(FLOOR + 0.03));
  floor.setAttribute("stroke", "currentColor");
  floor.setAttribute("stroke-width", "0.05");
  floor.setAttribute("stroke-linecap", "round");
  floor.setAttribute("opacity", "0.18");
  const bricks = doc.createElementNS(SVG_NS, "g");
  bricks.setAttribute("fill", "currentColor");
  svg.append(floor, bricks);

  const nodes = BRICKS.map((b) => {
    const n = brickNode(doc);
    bricks.append(n);
    return n;
  });
  const draw = (poseFor) => BRICKS.forEach((b, i) => nodes[i].setAttribute("transform", transformOf(poseFor(b))));

  if (options.reducedMotion) {
    draw(stillPose);
    return () => svg.replaceChildren();
  }

  let origin = win.performance.now();
  let raf = 0;
  const now = () => (win.performance.now() - origin) / 1000;
  const jumpTo = (target) => { origin = win.performance.now() - target * 1000; };
  const frame = () => {
    const t = now();
    draw((b) => poseAt(b, t));
    raf = win.requestAnimationFrame(frame);
  };
  draw((b) => poseAt(b, 0));
  raf = win.requestAnimationFrame(frame);

  const target = options.target || svg;
  const onEnter = () => { if (isResting(now())) jumpTo(REBUILD_AT); };
  const onClick = () => {
    const t = ((now() % LOOP) + LOOP) % LOOP;
    if (isResting(t)) jumpTo(REBUILD_AT);
    else if (t < HOLD - LOOSEN || t > REBUILD_AT + 1.6) jumpTo(HOLD - LOOSEN);
  };
  if (options.interactive !== false) {
    target.addEventListener("pointerenter", onEnter);
    target.addEventListener("click", onClick);
  }
  return () => {
    win.cancelAnimationFrame(raf);
    target.removeEventListener("pointerenter", onEnter);
    target.removeEventListener("click", onClick);
    svg.replaceChildren();
  };
}
