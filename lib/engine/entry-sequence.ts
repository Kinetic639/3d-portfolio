import * as THREE from "three";

/**
 * The way into the world, as the original project did it.
 *
 * 1. Landing: the camera looks down at the loader platform from far away and
 *    above, so the platform and its floating crystal sit at the bottom of the
 *    screen, under the page.
 * 2. Focus: a click glides the camera to a high view of the platform from
 *    above: the far end of the visitor's zoom curve.
 * 3. Expand: the terrain grows out of the platform in a wave while the camera
 *    comes down the same zoom curve the visitor's wheel uses (distance and
 *    tilt together), turning gently to the resting direction. When the wave
 *    has covered the original 64-cell area, the placed objects pop up,
 *    nearest first.
 *
 * Loader positions are in the original's coordinates, relative to the loader
 * platform (whose top was at y 2.5). The end of the path is wherever the
 * visitor's camera rests, so the hand-over to free movement has no jump.
 *
 * This module is pure: the engine samples it once per frame.
 */

/** Seconds from the click to the focused view. */
export const FOCUS_SECONDS = 1 / 0.7;
/** Seconds of the swing-out-and-settle move after the focus. */
export const EXPAND_SECONDS = 4;
/** Total length of the camera move, in seconds. */
export const ENTRY_SECONDS = FOCUS_SECONDS + EXPAND_SECONDS;
/** Terrain wave speed, in reveal-delay units per second: the original area (delay 0.96) is grown after about 2 s. */
export const WAVE_UNITS_PER_SECOND = 0.5;
/** Width of a cell's own grow animation, in reveal-delay units. Must match the terrain shader. */
export const WAVE_WINDOW = 0.22;
/** The wave reaches the edge of the original area here; objects start popping when it does. */
export const POP_START_WAVE = 1;

/** Original top of the loader platform; every height below is measured from the same ground. */
const ORIGINAL_PLATFORM_TOP = 2.5;
const LOADER_POSITION = new THREE.Vector3(-18, 20, 54);
const LOADER_TARGET = new THREE.Vector3(0, 17, 0);
const PLATFORM_TARGET = new THREE.Vector3(0, 2.8, 0);
/** The camera comes down the curve turning this much (radians) towards its resting direction. */
const TURN = THREE.MathUtils.degToRad(35);

export type EntryPlan = {
  /** Centre of the loader platform, x and z in world space. */
  platformX: number;
  platformZ: number;
  /** World height of the platform's top. */
  platformTop: number;
  /** Where the visitor's camera rests when the entry is over: its target, and the pose around it. */
  finalTarget: THREE.Vector3;
  finalYaw: number;
  finalDistance: number;
  /** Where the descent starts: the far end of the zoom curve. */
  farDistance: number;
  /** The zoom curve: tilt (radians) at a distance. */
  pitchAt: (distance: number) => number;
};

export type EntrySample = {
  /** Value for the terrain's reveal uniform. */
  wave: number;
  /** Seconds since objects started popping; negative while they are still hidden. */
  popSeconds: number;
  /** True once the camera has arrived. */
  done: boolean;
};

export function easeInOutCinematic(progress: number) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const direction = new THREE.Vector3();
/** Camera on the zoom curve: `distance` from `target`, turned by `yaw`. */
function onCurve(plan: EntryPlan, target: THREE.Vector3, distance: number, yaw: number, out: THREE.Vector3) {
  const pitch = plan.pitchAt(distance);
  direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  return out.copy(target).addScaledVector(direction, distance);
}

function shifted(plan: EntryPlan, point: THREE.Vector3, out: THREE.Vector3) {
  return out.set(point.x + plan.platformX, point.y + plan.platformTop - ORIGINAL_PLATFORM_TOP, point.z + plan.platformZ);
}

const s1 = new THREE.Vector3();
const s2 = new THREE.Vector3();
const s3 = new THREE.Vector3();
const s4 = new THREE.Vector3();

/** The landing view: platform and crystal at the bottom of the screen. */
export function loaderView(plan: EntryPlan, position: THREE.Vector3, target: THREE.Vector3) {
  shifted(plan, LOADER_POSITION, position);
  shifted(plan, LOADER_TARGET, target);
}

/**
 * Camera pose and animation state `seconds` after the click. Writes the pose
 * into `position` and `target`.
 */
export function sampleEntry(plan: EntryPlan, seconds: number, position: THREE.Vector3, target: THREE.Vector3): EntrySample {
  const platformTarget = shifted(plan, PLATFORM_TARGET, s4);
  if (seconds < FOCUS_SECONDS) {
    const eased = easeInOutCinematic(seconds / FOCUS_SECONDS);
    loaderView(plan, s1, s2);
    position.lerpVectors(s1, onCurve(plan, platformTarget, plan.farDistance, plan.finalYaw + TURN, s3), eased);
    target.lerpVectors(s2, platformTarget, eased);
    return { wave: 0, popSeconds: -1, done: false };
  }

  const expandSeconds = seconds - FOCUS_SECONDS;
  const progress = Math.min(1, expandSeconds / EXPAND_SECONDS);
  // Down the zoom curve: even steps in log distance, as the wheel takes them.
  const eased = easeInOutCinematic(progress);
  const distance = Math.exp(THREE.MathUtils.lerp(Math.log(plan.farDistance), Math.log(plan.finalDistance), eased));
  target.lerpVectors(platformTarget, plan.finalTarget, eased);
  onCurve(plan, target, distance, plan.finalYaw + TURN * (1 - eased), position);
  const wave = expandSeconds * WAVE_UNITS_PER_SECOND;
  return { wave, popSeconds: (wave - POP_START_WAVE) / WAVE_UNITS_PER_SECOND, done: progress >= 1 };
}

/** Moments of the entry worth rendering ahead of time: the whole path, evenly in time. */
export function rehearsalTimes(count: number) {
  return Array.from({ length: count }, (_, index) => (ENTRY_SECONDS * index) / (count - 1));
}

// --- Objects popping up -------------------------------------------------

export const POP_SECONDS = 0.62;
/** Spread of start times: the farthest object starts this long after the nearest. */
export const POP_STAGGER_SECONDS = 0.9;
export const POP_DROP = 0.42;
export const POP_TILT_X = -0.14;
export const POP_TILT_Z = 0.08;
/** Seconds from the first pop to the last object at rest. */
export const POP_TOTAL_SECONDS = POP_STAGGER_SECONDS + POP_SECONDS;
/** A pop time at which every object is at rest. */
export const POP_COMPLETE = 1000;

/** A stable number in [0, 1] from a string, so every visit pops objects in the same order. */
export function stableUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

/** When an object starts popping, from its distance to the platform (0 nearest, 1 farthest) and its id. */
export function popDelay(radialProgress: number, id: string) {
  return (THREE.MathUtils.clamp(radialProgress, 0, 1) * 0.78 + stableUnit(id) * 0.22) * POP_STAGGER_SECONDS;
}

/** The pop at a moment. The object shader (entity-meshes.ts) evaluates the same curve on the GPU. */
export function samplePop(seconds: number, delay: number) {
  const progress = THREE.MathUtils.clamp((seconds - delay) / POP_SECONDS, 0, 1);
  const eased = 1 - Math.pow(1 - progress, 3);
  const bounce = Math.sin(Math.PI * progress) * (1 - progress);
  return {
    scale: 0.001 + 0.999 * eased + bounce * 0.4,
    lift: -POP_DROP * (1 - eased) + bounce * 0.18,
    tiltX: POP_TILT_X * (1 - eased),
    tiltZ: POP_TILT_Z * (1 - eased),
  };
}
