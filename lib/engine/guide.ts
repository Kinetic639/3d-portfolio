/**
 * The guide in the world (docs/roadmap.md, B6): the portrait's character,
 * keeping the visitor company. The visitor is the camera; the guide goes
 * where the camera looks and waits there, facing the visitor.
 *
 * This module is the guide's decisions, pure (no three.js): where to stand
 * for a given view, and how to get there. The engine applies them to the
 * guide's actor (lib/engine/actor.ts).
 */

export type Point = { x: number; z: number };

export type GuideMove =
  | { kind: "stay" }
  | { kind: "walk" | "run" | "appear"; spot: Point };

export const GUIDE = {
  /** Model id in the asset pipeline (assets/models/guide). */
  modelId: "guide",
  /** Entity id of the guide the engine adds to every world. */
  entityId: "guide",
  /** The guide stands this far from the point the camera looks at, towards the camera: in front, not under the centre. */
  standOff: 2.2,
  /** ...and this far to the side, so it does not cover what the visitor looks at. */
  aside: 1.6,
  /** Closer than this to its spot, it stays where it is. */
  slack: 3,
  /** Further than this, it runs instead of walking. */
  runFrom: 7,
  /** Further than this (a flight to a zone, a jump across the map), it appears at the spot instead. */
  appearFrom: 26,
  /** How long the camera must be still before the guide sets off (ms): it follows where the visitor stops, not every drag. */
  restMs: 350,
};

/**
 * Where the guide should stand for a view: near the point the camera looks
 * at, a little towards the camera and to its left, so it is in the frame
 * without covering what is looked at.
 */
export function guideSpot(target: Point, camera: Point): Point {
  let dx = camera.x - target.x;
  let dz = camera.z - target.z;
  const length = Math.hypot(dx, dz) || 1;
  dx /= length;
  dz /= length;
  // Left of the view direction, as the camera sees it.
  const leftX = -dz;
  const leftZ = dx;
  return {
    x: target.x + dx * GUIDE.standOff + leftX * GUIDE.aside,
    z: target.z + dz * GUIDE.standOff + leftZ * GUIDE.aside,
  };
}

/** How the guide gets from where it is to its spot for a view. */
export function planGuideMove(guide: Point, target: Point, camera: Point): GuideMove {
  const spot = guideSpot(target, camera);
  const distance = Math.hypot(spot.x - guide.x, spot.z - guide.z);
  if (distance <= GUIDE.slack) return { kind: "stay" };
  if (distance > GUIDE.appearFrom) return { kind: "appear", spot };
  return { kind: distance > GUIDE.runFrom ? "run" : "walk", spot };
}

/**
 * Life while it waits (B6): now and then it looks around or folds its arms,
 * and after a long quiet it waves at the visitor once. Seconds.
 */
export const IDLE = {
  /** The first fidget, this long after it settles. */
  firstAfter: 4,
  /** Then one every so often, at random between these. */
  between: [6, 11] as const,
  /** After this long with the camera still, one wave ("still there?"); once per rest. */
  waveAfter: 22,
  /** A look aside: this far (radians, either way) for this long. */
  lookAngle: [0.6, 1.0] as const,
  lookHold: [1.8, 3] as const,
  /** Arms folded, for this long. */
  armsHold: [6, 9] as const,
};

export type Fidget = { kind: "look"; offset: number; seconds: number } | { kind: "arms"; seconds: number };

const between = (random: () => number, [low, high]: readonly [number, number]) => low + (high - low) * random();

/** The next thing it does while it waits; folding its arms twice in a row looks stuck, so not after arms. */
export function pickFidget(random: () => number, previous: Fidget["kind"] | null): Fidget {
  if (previous !== "arms" && random() < 0.35) return { kind: "arms", seconds: between(random, IDLE.armsHold) };
  const side = random() < 0.5 ? -1 : 1;
  return { kind: "look", offset: side * between(random, IDLE.lookAngle), seconds: between(random, IDLE.lookHold) };
}

/** Seconds until the next fidget. */
export const fidgetGap = (random: () => number) => between(random, IDLE.between);

/** The heading (yaw, radians, three.js convention: 0 looks along +z) from one point towards another. */
export function yawTowards(from: Point, to: Point) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}
