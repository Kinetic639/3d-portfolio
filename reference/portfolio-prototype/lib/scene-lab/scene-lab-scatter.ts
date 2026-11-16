import * as THREE from "three";
import { getReferenceAsset, type ReferenceAssetId, type SceneLabInstanceMode } from "./reference-asset-registry";
import type { SceneLabInstance } from "./scene-lab-controller";

export type SceneLabScatterOptions = {
  count: number;
  radius: number;
  minimumSpacing: number;
  seed: number;
  randomRotation: boolean;
  randomScale: boolean;
  scaleMin: number;
  scaleMax: number;
};

export type SceneLabSurfaceQuery = (x: number, z: number) => number | null;

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createScatteredInstances(
  assetId: ReferenceAssetId,
  mode: SceneLabInstanceMode,
  origin: THREE.Vector3,
  options: SceneLabScatterOptions,
  resolveSurface: SceneLabSurfaceQuery,
): Omit<SceneLabInstance, "id">[] {
  const asset = getReferenceAsset(assetId);
  const resolvedMode = asset.assetType === "skinnedActor" ? "actor" : mode;
  const random = mulberry32(Math.trunc(options.seed));
  const accepted: Array<{ x: number; z: number }> = [];
  const instances: Omit<SceneLabInstance, "id">[] = [];
  const minimumSpacingSquared = options.minimumSpacing * options.minimumSpacing;
  const attempts = Math.max(options.count * 50, 100);

  for (let attempt = 0; attempt < attempts && instances.length < options.count; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * options.radius;
    const x = origin.x + Math.cos(angle) * distance;
    const z = origin.z + Math.sin(angle) * distance;
    if (accepted.some((point) => ((point.x - x) ** 2 + (point.z - z) ** 2) < minimumSpacingSquared)) continue;
    const surfaceY = resolveSurface(x, z);
    if (surfaceY === null) continue;

    const scaleFactor = options.randomScale
      ? THREE.MathUtils.lerp(options.scaleMin, options.scaleMax, random())
      : 1;
    accepted.push({ x, z });
    instances.push({
      assetId,
      mode: resolvedMode,
      position: [x, surfaceY + asset.defaults.groundOffset, z],
      rotation: [0, options.randomRotation ? random() * Math.PI * 2 : asset.defaults.rotation[1], 0],
      scale: asset.defaults.scale.map((value) => value * scaleFactor) as [number, number, number],
    });
  }

  return instances;
}
