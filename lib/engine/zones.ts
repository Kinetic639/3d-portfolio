import * as THREE from "three";
import type { WorldQuery } from "./world-query";
import { easeInOutCinematic } from "./entry-sequence";

/**
 * Zones as places: where each one is, how to frame it, and how the camera
 * flies there. Pure: the engine owns the camera and calls in.
 */

export type ZoneArea = {
  numericId: number;
  /** World-space bounds of the zone's columns (cell edges). */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Where its name sits: the zone's column nearest its middle, on top of the ground. */
  labelX: number;
  labelY: number;
  labelZ: number;
  columns: number;
};

/** One pass over the columns: bounds and a label anchor for every zone. */
export function measureZones(query: WorldQuery): Map<number, ZoneArea> {
  const { width, depth } = query;
  const sums = new Map<number, { minX: number; maxX: number; minZ: number; maxZ: number; sumX: number; sumZ: number; columns: number }>();
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const id = query.columnZone(x, z);
      if (id === 0) continue;
      const sum = sums.get(id) ?? { minX: x, maxX: x, minZ: z, maxZ: z, sumX: 0, sumZ: 0, columns: 0 };
      sum.minX = Math.min(sum.minX, x);
      sum.maxX = Math.max(sum.maxX, x);
      sum.minZ = Math.min(sum.minZ, z);
      sum.maxZ = Math.max(sum.maxZ, z);
      sum.sumX += x;
      sum.sumZ += z;
      sum.columns += 1;
      sums.set(id, sum);
    }
  }
  const areas = new Map<number, ZoneArea>();
  for (const [id, sum] of sums) {
    // The zone's own column nearest its mean, so a ring-shaped zone does not name the hole.
    const meanX = sum.sumX / sum.columns;
    const meanZ = sum.sumZ / sum.columns;
    let best = { x: sum.minX, z: sum.minZ, distance: Infinity };
    for (let z = sum.minZ; z <= sum.maxZ; z += 1) {
      for (let x = sum.minX; x <= sum.maxX; x += 1) {
        if (query.columnZone(x, z) !== id) continue;
        const distance = (x - meanX) ** 2 + (z - meanZ) ** 2;
        if (distance < best.distance) best = { x, z, distance };
      }
    }
    areas.set(id, {
      numericId: id,
      minX: sum.minX - width / 2,
      maxX: sum.maxX + 1 - width / 2,
      minZ: sum.minZ - depth / 2,
      maxZ: sum.maxZ + 1 - depth / 2,
      labelX: best.x + 0.5 - width / 2,
      labelY: query.surfaceHeight(best.x, best.z),
      labelZ: best.z + 0.5 - depth / 2,
      columns: sum.columns,
    });
  }
  return areas;
}

export type ZoneFrame = { x: number; z: number; distance: number };

/**
 * The view that shows a whole zone from a direction: its centre, and the
 * distance at which its bounds fit the screen with a margin. The tilt comes
 * from `pitchAt` (the zoom curve), which itself depends on the distance, so
 * the fit is solved by a few rounds of iteration.
 */
export function frameZone(
  area: Pick<ZoneArea, "minX" | "maxX" | "minZ" | "maxZ">,
  view: { yawRadians: number; fovDegrees: number; aspect: number; pitchAt: (distance: number) => number; minDistance: number; maxDistance: number },
  margin = 1.25,
): ZoneFrame {
  const x = (area.minX + area.maxX) / 2;
  const z = (area.minZ + area.maxZ) / 2;
  // Half extents of the rectangle across the screen and along the view direction.
  const right = new THREE.Vector2(Math.cos(view.yawRadians), -Math.sin(view.yawRadians));
  const forward = new THREE.Vector2(Math.sin(view.yawRadians), Math.cos(view.yawRadians));
  let across = 0;
  let along = 0;
  for (const cx of [area.minX - x, area.maxX - x]) {
    for (const cz of [area.minZ - z, area.maxZ - z]) {
      across = Math.max(across, Math.abs(cx * right.x + cz * right.y));
      along = Math.max(along, Math.abs(cx * forward.x + cz * forward.y));
    }
  }
  const halfFov = THREE.MathUtils.degToRad(view.fovDegrees) / 2;
  const tanV = Math.tan(halfFov);
  const tanH = tanV * view.aspect;
  let distance = view.minDistance;
  for (let round = 0; round < 4; round += 1) {
    const pitch = view.pitchAt(distance);
    // Ground depth seen on screen shrinks with the tilt: a top-down view sees it whole.
    distance = Math.max((across * margin) / tanH, (along * margin * Math.sin(pitch)) / tanV, view.minDistance);
  }
  return { x, z, distance: Math.min(distance, view.maxDistance) };
}

export type FlightPose = { x: number; z: number; distance: number; yaw: number };

export type Flight = {
  from: FlightPose;
  to: FlightPose;
  seconds: number;
  /** How far up (log distance) the camera rises in the middle: long flights go over, not through. */
  rise: number;
};

/**
 * A flight from one view to another along the zoom curve: the target moves
 * with the cinematic ease, the distance moves in log steps (as the wheel
 * does) and lifts in the middle when the trip is long compared to the view.
 */
export function planFlight(from: FlightPose, to: FlightPose): Flight {
  const travel = Math.hypot(to.x - from.x, to.z - from.z);
  const view = Math.max(from.distance, to.distance);
  const rise = Math.log(1 + Math.max(0, travel - view * 0.5) / (view * 1.5));
  let turn = to.yaw - from.yaw;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  const seconds = THREE.MathUtils.clamp(0.9 + travel / 45 + Math.abs(turn) * 0.25, 0.9, 2.4);
  return { from, to: { ...to, yaw: from.yaw + turn }, seconds, rise };
}

export function sampleFlight(flight: Flight, seconds: number): FlightPose & { done: boolean } {
  const progress = Math.min(1, seconds / flight.seconds);
  const eased = easeInOutCinematic(progress);
  const { from, to } = flight;
  const logDistance = THREE.MathUtils.lerp(Math.log(from.distance), Math.log(to.distance), eased) + flight.rise * Math.sin(Math.PI * eased);
  return {
    x: THREE.MathUtils.lerp(from.x, to.x, eased),
    z: THREE.MathUtils.lerp(from.z, to.z, eased),
    distance: Math.exp(logDistance),
    yaw: THREE.MathUtils.lerp(from.yaw, to.yaw, eased),
    done: progress >= 1,
  };
}

/** Yaw (radians, the rig's convention: camera offset is sin/cos of yaw) that looks at a zone from its focus direction. */
export const FOCUS_DIRECTION_YAW: Record<string, number> = {
  south: 0,
  southeast: Math.PI / 4,
  east: Math.PI / 2,
  northeast: (3 * Math.PI) / 4,
  north: Math.PI,
  northwest: -(3 * Math.PI) / 4,
  west: -Math.PI / 2,
  southwest: -Math.PI / 4,
};
