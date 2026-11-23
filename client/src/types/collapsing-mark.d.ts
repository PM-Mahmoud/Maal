// Types for shared/collapsing-mark.mjs (the 404 page's animated Maal mark).
declare module "*collapsing-mark.mjs" {
  export type Pose = { x: number; y: number; rot: number };
  export type Brick = {
    id: string; col: number; row: number; home: Pose; falls: boolean;
    rest: Pose | null; restAngle: number; order: number;
  };
  export const FLOOR: number;
  export const LOOP: number;
  export const VIEWBOX: { x: number; y: number; w: number; h: number };
  export const BRICKS: Brick[];
  export function fallWindow(b: Brick): { start: number; land: number };
  export function poseAt(b: Brick, t: number): Pose;
  export function stillPose(b: Brick): Pose;
  export function isResting(t: number): boolean;
  export function mountCollapsingMark(
    svg: SVGSVGElement,
    options?: { reducedMotion?: boolean; interactive?: boolean; target?: Element },
  ): () => void;
}
