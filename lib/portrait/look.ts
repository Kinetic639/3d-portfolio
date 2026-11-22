/**
 * Where the portrait looks: pure math, shared by the portrait scene and its tests.
 *
 * Angles are radians. Yaw is positive towards the right of the screen, pitch
 * positive upwards. The head takes most of a turn and the neck the rest; the
 * eyes go further than the head, so a glance reads before the head follows.
 */

/** Down less than up: a head bowed far reads as sad, not attentive. */
export const LOOK_LIMITS = { yaw: 0.6, up: 0.3, down: 0.16 };
/** How far behind the screen the pointer is imagined, in CSS pixels: larger means calmer turns. */
export const LOOK_DEPTH_PX = 700;
/** Share of a turn taken by the neck; the head takes the rest. */
export const NECK_SHARE = 0.35;

export type Look = { yaw: number; pitch: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The look towards a point on the page (client pixels) from the eyes'
 * position on the page (also client pixels), within the limits.
 */
export function lookTowards(pointX: number, pointY: number, eyesX: number, eyesY: number, depth = LOOK_DEPTH_PX): Look {
  return {
    yaw: clamp(Math.atan2(pointX - eyesX, depth), -LOOK_LIMITS.yaw, LOOK_LIMITS.yaw),
    pitch: clamp(Math.atan2(eyesY - pointY, depth), -LOOK_LIMITS.down, LOOK_LIMITS.up),
  };
}

/** Eases `current` towards `target` at `rate` per second, independent of frame rate. */
export function dampLook(current: Look, target: Look, rate: number, deltaSeconds: number): Look {
  const t = 1 - Math.exp(-rate * deltaSeconds);
  return { yaw: current.yaw + (target.yaw - current.yaw) * t, pitch: current.pitch + (target.pitch - current.pitch) * t };
}

/** Whether two looks are close enough that drawing another frame would show no change. */
export function looksEqual(a: Look, b: Look, epsilon = 0.002) {
  return Math.abs(a.yaw - b.yaw) < epsilon && Math.abs(a.pitch - b.pitch) < epsilon;
}

/**
 * A calm glance for when nobody points (phones, or a pointer that stopped):
 * somewhere near the middle, chosen by `random` (0..1).
 */
export function glance(random: () => number): Look {
  return { yaw: (random() - 0.5) * LOOK_LIMITS.yaw * 1.2, pitch: (random() - 0.4) * LOOK_LIMITS.up * 0.6 };
}
