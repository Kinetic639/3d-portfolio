import { describe, expect, it } from "vitest";
import { createPlacedEntity } from "@/lib/maps/map-entities";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { getTerrainSurfaceAt } from "@/lib/world/surface-query";
import { VoxelWorld, createFlatVoxelWorld } from "@/lib/world/voxel-world";
import { getPrefabDefinition } from "./prefab-library";
import { groundEntityOnTerrain } from "./prefab-placement";
import { resolvePrefabVisualBounds } from "./prefab-resolver";

function prefabEntity(prefabId: string, x = 0, z = 0, rotationY = 0, variantId?: string) {
  const prefab = getPrefabDefinition(prefabId);
  if (!prefab) throw new Error(`Missing test prefab ${prefabId}`);
  const variant = prefab.variants.find((candidate) => candidate.id === (variantId ?? prefab.defaultVariantId)) ?? prefab.variants[0];
  return createPlacedEntity({
    id: `${prefabId}-test`,
    name: prefab.name,
    entityType: "prefab",
    primitiveType: "box",
    prefabId,
    prefabVersion: prefab.version,
    variantId: variant.id,
    transform: { position: { x, y: 0, z }, rotation: { x: 0, y: rotationY, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    footprint: variant.footprintOverride ?? prefab.footprint,
    collisionMode: prefab.collisionMode,
  });
}

describe("prefab placement grounding", () => {
  it("reports the top face of the highest supporting voxel", () => {
    const world = new VoxelWorld();
    world.setBlock(31, 0, 31, BLOCK_IDS.Ground);
    world.setBlock(31, 1, 31, BLOCK_IDS.Special);
    const surface = getTerrainSurfaceAt(world, 31, 31);
    expect(surface.valid).toBe(true);
    if (surface.valid) {
      expect(surface.grid).toEqual({ x: 31, y: 1, z: 31 });
      expect(surface.worldPosition).toEqual({ x: -0.5, y: 2, z: -0.5 });
    }
  });

  it("grounds short, tall, compound and scaled prefabs without terrain intersection", () => {
    const world = createFlatVoxelWorld();
    for (const entity of [
      prefabEntity("bench"),
      prefabEntity("building-mass", 3, 0, 0, "large"),
      prefabEntity("central-portfolio-sign", -3),
      prefabEntity("cv-flyer", 0, 3, 0, "open"),
    ]) {
      const grounded = groundEntityOnTerrain(world, entity);
      expect(grounded.ok).toBe(true);
      if (!grounded.ok) continue;
      const bounds = resolvePrefabVisualBounds(grounded.entity);
      expect(bounds?.minY).toBeCloseTo(grounded.surfaceY, 3);
    }
  });

  it("grounds new reusable Phase 5 compound prefabs at their bottom placement anchors", () => {
    const world = createFlatVoxelWorld();
    for (const entity of [
      prefabEntity("central-orientation-monument", 0, 0, Math.PI / 2, "tall"),
      prefabEntity("portfolio-workshop-compound", 0, 0, Math.PI / 2, "large"),
      prefabEntity("personal-studio-compound", 0, 0, Math.PI, "wide"),
      prefabEntity("communication-station", 0, 0, -Math.PI / 2),
      prefabEntity("skill-branch-landmark", 0, 0, Math.PI / 4, "large"),
      prefabEntity("scale-reference-mannequin", 0, 0, 0),
      prefabEntity("portfolio-v2-developer-workshop", 0, 0, Math.PI / 2, "standard"),
      prefabEntity("portfolio-v2-personal-studio", 0, 0, Math.PI, "medium"),
      prefabEntity("portfolio-v2-communication-building", 0, 0, -Math.PI / 2, "medium"),
      prefabEntity("portfolio-v2-skill-tree", 0, 0, Math.PI / 4, "large"),
      prefabEntity("portfolio-v2-scale-reference", 0, 0, 0),
    ]) {
      const grounded = groundEntityOnTerrain(world, entity, { supportMode: "single-cell" });
      expect(grounded.ok).toBe(true);
      if (!grounded.ok) continue;
      expect(resolvePrefabVisualBounds(grounded.entity)?.minY).toBeCloseTo(grounded.surfaceY, 3);
    }
  });

  it("supports elevated terrain and chunk-boundary columns", () => {
    const world = createFlatVoxelWorld();
    world.setBlock(16, 1, 16, BLOCK_IDS.Special);
    const entity = prefabEntity("lamp-post", -15.5, -15.5);
    const grounded = groundEntityOnTerrain(world, entity);
    expect(grounded.ok).toBe(true);
    if (grounded.ok) {
      expect(grounded.surfaceY).toBe(2);
      expect(resolvePrefabVisualBounds(grounded.entity)?.minY).toBeCloseTo(2, 3);
    }
  });

  it("rejects large structures on unsupported or uneven footprints and accepts a foundation", () => {
    const unsupported = new VoxelWorld();
    unsupported.setBlock(31, 0, 31, BLOCK_IDS.Ground);
    expect(groundEntityOnTerrain(unsupported, prefabEntity("building-mass"), { supportMode: "entire-footprint" }).ok).toBe(false);

    const uneven = createFlatVoxelWorld();
    uneven.setBlock(32, 1, 32, BLOCK_IDS.Special);
    expect(groundEntityOnTerrain(uneven, prefabEntity("building-mass"), { supportMode: "entire-footprint", maxSupportHeightDifference: 0.01 }).ok).toBe(false);

    const foundation = createFlatVoxelWorld();
    for (let z = 29; z <= 34; z += 1) {
      for (let x = 29; x <= 34; x += 1) {
        foundation.setBlock(x, 1, z, BLOCK_IDS.Special);
      }
    }
    expect(groundEntityOnTerrain(foundation, prefabEntity("building-mass"), { supportMode: "entire-footprint", maxSupportHeightDifference: 0.01 }).ok).toBe(true);
  });

  it("uses rotated rectangular footprint samples for support validation", () => {
    const world = createFlatVoxelWorld();
    const bridge = prefabEntity("bridge", 0, 0, Math.PI / 2, "medium");
    const grounded = groundEntityOnTerrain(world, bridge, { supportMode: "entire-footprint" });
    expect(grounded.ok).toBe(true);
    if (grounded.ok) {
      expect(grounded.support.cells).toHaveLength(5);
    }
  });
});
