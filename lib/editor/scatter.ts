/**
 * Scatter, from the style lab's Scene Lab (scene-lab-scatter.ts): many
 * instances of one object around a point, at random but repeatable spots
 * (the seed), apart by at least a minimum spacing, each on the ground.
 *
 * Pure: the caller says where the ground is and turns the placements into
 * entities (one undo step for the whole scatter).
 */
export type ScatterSettings = {
  /** Off: Place puts down one object per click. On: a scatter per click. */
  enabled: boolean;
  count: number;
  /** Radius around the click, in blocks. */
  radius: number;
  /** Minimum distance between two scattered objects, in blocks. */
  spacing: number;
  seed: number;
  randomRotation: boolean;
  randomScale: boolean;
  scaleMin: number;
  scaleMax: number;
};

export const DEFAULT_SCATTER: ScatterSettings = {
  enabled: false,
  count: 12,
  radius: 8,
  spacing: 2,
  seed: 1,
  randomRotation: true,
  randomScale: true,
  scaleMin: 0.8,
  scaleMax: 1.2,
};

export type ScatterPlacement = { x: number; z: number; rotationY: number; scale: number };

/** The lab's generator: small, fast, the same sequence for the same seed. */
export function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Up to `count` placements in a disc around `origin` (uniform over the
 * area), at least `spacing` apart, where `hasGround` says there is ground.
 * Fewer when the area cannot hold more; gives up after 50 tries per object,
 * as the lab did.
 */
export function scatterPlacements(origin: { x: number; z: number }, settings: ScatterSettings, hasGround: (x: number, z: number) => boolean): ScatterPlacement[] {
  const random = mulberry32(Math.trunc(settings.seed));
  const placements: ScatterPlacement[] = [];
  const minimum = settings.spacing * settings.spacing;
  const attempts = Math.max(settings.count * 50, 100);
  for (let attempt = 0; attempt < attempts && placements.length < settings.count; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * settings.radius;
    const x = origin.x + Math.cos(angle) * distance;
    const z = origin.z + Math.sin(angle) * distance;
    // Rotation and scale are drawn for every attempt, so a rejected spot does not shift the rest of the sequence.
    const rotation = random() * Math.PI * 2;
    const scaleRoll = random();
    if (placements.some((placement) => (placement.x - x) ** 2 + (placement.z - z) ** 2 < minimum)) continue;
    if (!hasGround(x, z)) continue;
    placements.push({
      x,
      z,
      rotationY: settings.randomRotation ? rotation : 0,
      scale: settings.randomScale ? settings.scaleMin + (settings.scaleMax - settings.scaleMin) * scaleRoll : 1,
    });
  }
  return placements;
}
