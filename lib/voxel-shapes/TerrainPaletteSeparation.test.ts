import { describe, expect, it } from "vitest";
import { SHAPE_IDS } from "./shape-ids";
import { PALETTE_HIDDEN_SHAPE_IDS, TERRAIN_PALETTE_SHAPE_DEFINITIONS, getShapeDefinition } from "./shape-registry";
import { BUILT_IN_PREFABS, getPrefabDefinition } from "@/lib/prefabs/prefab-library";
import { createPlacedEntity } from "@/lib/maps/map-entities";
import { createBlankMapDefinition } from "@/lib/maps/map-definition";
import { BLOCK_IDS } from "@/lib/world/block-registry";

const APPROVED_TERRAIN_SHAPE_KEYS = new Set([
  "cube",
  "slab",
  "stair",
  "slope-shallow",
  "slope-steep",
  "outer-stair-corner",
  "inner-stair-corner",
  "cut-corner",
  "terrain-corner",
  "stair-inverted",
  "stair-low",
  "outer-stair-corner-inverted",
  "inner-stair-corner-inverted",
  "stair-low-outer-corner",
  "stair-low-inner-corner",
  "terrain-diagonal-bank",
  "terrain-raised-edge",
]);

const FENCE_SHAPE_IDS = [SHAPE_IDS.FENCE, SHAPE_IDS.FENCE_POST, SHAPE_IDS.FENCE_CORNER, SHAPE_IDS.FENCE_T, SHAPE_IDS.FENCE_CROSS, SHAPE_IDS.FENCE_GATE];
const PIPE_SHAPE_IDS = [SHAPE_IDS.PIPE_SHORT, SHAPE_IDS.PIPE_LONG, SHAPE_IDS.PIPE_CORNER, SHAPE_IDS.PIPE];
const WALL_PILLAR_SHAPE_IDS = [SHAPE_IDS.WALL, SHAPE_IDS.BEAM, SHAPE_IDS.PILLAR_BASE, SHAPE_IDS.PILLAR_MIDDLE, SHAPE_IDS.PILLAR_CAP];
const ROOF_SHAPE_IDS = [SHAPE_IDS.ROOF_FLAT, SHAPE_IDS.ROOF_SHALLOW, SHAPE_IDS.ROOF_STEEP, SHAPE_IDS.ROOF_OUTER_CORNER, SHAPE_IDS.ROOF_INNER_CORNER, SHAPE_IDS.ROOF_HOLLOW, SHAPE_IDS.ROOF];
const WOODEN_WALL_SHAPE_IDS = [
  SHAPE_IDS.WOODEN_WALL_FULL, SHAPE_IDS.WOODEN_WALL_END, SHAPE_IDS.WOODEN_WALL_CORNER, SHAPE_IDS.WOODEN_WALL_T, SHAPE_IDS.WOODEN_WALL_CROSS, SHAPE_IDS.WOODEN_WALL_GATE,
  SHAPE_IDS.SOLID_WOODEN_WALL_FULL, SHAPE_IDS.SOLID_WOODEN_WALL_END, SHAPE_IDS.SOLID_WOODEN_WALL_CORNER, SHAPE_IDS.SOLID_WOODEN_WALL_T, SHAPE_IDS.SOLID_WOODEN_WALL_CROSS, SHAPE_IDS.SOLID_WOODEN_WALL_GATE,
];
const NATURAL_OBJECT_SHAPE_IDS = [
  SHAPE_IDS.RUBBLE_SMALL, SHAPE_IDS.RUBBLE_MEDIUM, SHAPE_IDS.STALACTITE_SMALL, SHAPE_IDS.STALACTITE_LARGE,
  SHAPE_IDS.CRYSTAL_SMALL, SHAPE_IDS.CRYSTAL_MEDIUM, SHAPE_IDS.CRYSTAL_LARGE, SHAPE_IDS.ICE_CHUNKS, SHAPE_IDS.ICE_CHUNKS_MEDIUM, SHAPE_IDS.ICICLES, SHAPE_IDS.ICICLES_LARGE,
];

const CONVERTED_PREFAB_IDS = [
  "voxel-wall-panel", "structural-beam", "pillar-base", "pillar-complete", "pillar-cap",
  "flat-roof-panel", "shallow-roof-panel", "steep-roof-panel", "roof-corner-outer", "roof-corner-inner", "hollow-roof-panel", "gable-roof-panel",
  "modular-fence-post", "modular-fence-line", "modular-fence-corner", "modular-fence-t-junction", "modular-fence-cross-junction", "modular-fence-gate",
  "pipe-segment-short", "pipe-segment-long", "pipe-segment-wide", "pipe-corner-modular",
  "wooden-wall-panel", "wooden-wall-end-post", "wooden-wall-corner", "wooden-wall-t-junction", "wooden-wall-cross-junction", "wooden-wall-gate",
  "solid-wooden-wall-panel", "solid-wooden-wall-end-post", "solid-wooden-wall-corner", "solid-wooden-wall-t-junction", "solid-wooden-wall-cross-junction", "solid-wooden-wall-gate",
  "low-retaining-wall-panel",
  "small-rubble-pile", "medium-rubble-pile", "small-stalactite", "large-stalactite",
  "small-crystal-formation", "medium-crystal-formation", "large-crystal-formation",
  "ice-chunks", "ice-chunks-medium", "icicles", "large-icicles",
];

describe("terrain palette / placeable object separation", () => {
  it("the terrain palette contains only the approved terrain shapes (1)", () => {
    const paletteKeys = new Set(TERRAIN_PALETTE_SHAPE_DEFINITIONS.map((s) => s.key));
    expect(paletteKeys).toEqual(APPROVED_TERRAIN_SHAPE_KEYS);
  });

  it("all fence shape ids are absent from the terrain palette (2)", () => {
    const paletteIds = new Set(TERRAIN_PALETTE_SHAPE_DEFINITIONS.map((s) => s.id));
    for (const id of FENCE_SHAPE_IDS) expect(paletteIds.has(id)).toBe(false);
  });

  it("every fence piece has a placeable-object equivalent (3)", () => {
    for (const id of ["modular-fence-post", "modular-fence-line", "modular-fence-corner", "modular-fence-t-junction", "modular-fence-cross-junction", "modular-fence-gate"]) {
      const prefab = getPrefabDefinition(id);
      expect(prefab, `expected prefab ${id} to exist`).not.toBeNull();
      expect(prefab?.category).toBe("fences");
      expect(prefab?.parts.length).toBeGreaterThan(0);
    }
  });

  it("pipes, walls, pillars, roofs and wooden walls are absent from the terrain palette and available as objects (4)", () => {
    const paletteIds = new Set(TERRAIN_PALETTE_SHAPE_DEFINITIONS.map((s) => s.id));
    for (const id of [...PIPE_SHAPE_IDS, ...WALL_PILLAR_SHAPE_IDS, ...ROOF_SHAPE_IDS, ...WOODEN_WALL_SHAPE_IDS]) {
      expect(paletteIds.has(id)).toBe(false);
    }
    for (const prefabId of CONVERTED_PREFAB_IDS) {
      expect(getPrefabDefinition(prefabId), `expected placeable object ${prefabId}`).not.toBeNull();
    }
  });

  it("rubble, crystals, stalactites, ice chunks and icicles are objects, not terrain shapes (5)", () => {
    const paletteIds = new Set(TERRAIN_PALETTE_SHAPE_DEFINITIONS.map((s) => s.id));
    for (const id of NATURAL_OBJECT_SHAPE_IDS) expect(paletteIds.has(id)).toBe(false);
    for (const prefabId of ["small-rubble-pile", "medium-rubble-pile", "small-stalactite", "large-stalactite", "small-crystal-formation", "medium-crystal-formation", "large-crystal-formation", "ice-chunks", "ice-chunks-medium", "icicles", "large-icicles"]) {
      const prefab = getPrefabDefinition(prefabId);
      expect(prefab).not.toBeNull();
      expect(["rocks-rubble", "crystals-caves", "ice-formations"]).toContain(prefab?.category);
    }
  });

  it("water is absent from the general terrain shape palette", () => {
    const paletteIds = new Set(TERRAIN_PALETTE_SHAPE_DEFINITIONS.map((s) => s.id));
    expect(paletteIds.has(SHAPE_IDS.WATER)).toBe(false);
    expect(PALETTE_HIDDEN_SHAPE_IDS.has(SHAPE_IDS.WATER)).toBe(true);
  });

  it("all converted shapes remain fully resolvable via getShapeDefinition (legacy resolver kept intact)", () => {
    for (const id of [...FENCE_SHAPE_IDS, ...PIPE_SHAPE_IDS, ...WALL_PILLAR_SHAPE_IDS, ...ROOF_SHAPE_IDS, ...WOODEN_WALL_SHAPE_IDS, ...NATURAL_OBJECT_SHAPE_IDS, SHAPE_IDS.WATER]) {
      const shape = getShapeDefinition(id);
      expect(shape.id).toBe(id);
    }
  });

  it("retaining-wall-low is hidden (no walkable surface) while terrain-raised-edge is kept (genuine walkable surface)", () => {
    const paletteIds = new Set(TERRAIN_PALETTE_SHAPE_DEFINITIONS.map((s) => s.id));
    expect(paletteIds.has(SHAPE_IDS.RETAINING_WALL_LOW)).toBe(false);
    expect(paletteIds.has(SHAPE_IDS.TERRAIN_RAISED_EDGE)).toBe(true);
  });

  it("placing a converted placeable object does not replace or touch the supporting terrain cell (6)", () => {
    const map = createBlankMapDefinition({ id: "voxel-object-placement-test", name: "Placement Test", flatBaseLayer: true });
    const cellBefore = map.blocks.edits.find((edit) => edit.x === 10 && edit.z === 10);
    const wallPrefab = getPrefabDefinition("voxel-wall-panel")!;

    map.entities.push(createPlacedEntity({
      id: "wall-instance",
      entityType: "prefab",
      primitiveType: "box",
      prefabId: "voxel-wall-panel",
      prefabVersion: wallPrefab.version,
      variantId: wallPrefab.defaultVariantId,
      transform: { position: { x: 10 - 31.5, y: 1.5, z: 10 - 31.5 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      footprint: wallPrefab.footprint,
      collisionMode: wallPrefab.collisionMode,
    }));

    const cellAfter = map.blocks.edits.find((edit) => edit.x === 10 && edit.z === 10);
    expect(cellAfter).toEqual(cellBefore);
    expect(map.entities).toHaveLength(1);
  });

  it("deleting a placed object does not delete the terrain beneath it (7)", () => {
    const map = createBlankMapDefinition({ id: "voxel-object-deletion-test", name: "Deletion Test", flatBaseLayer: true });
    const groundEditsBefore = map.blocks.edits.filter((edit) => edit.blockId === BLOCK_IDS.Ground).length;
    const rockPrefab = getPrefabDefinition("small-rubble-pile")!;

    map.entities.push(createPlacedEntity({
      id: "rubble-instance",
      entityType: "prefab",
      primitiveType: "box",
      prefabId: "small-rubble-pile",
      prefabVersion: rockPrefab.version,
      variantId: rockPrefab.defaultVariantId,
      footprint: rockPrefab.footprint,
      collisionMode: rockPrefab.collisionMode,
    }));

    map.entities = map.entities.filter((entity) => entity.id !== "rubble-instance");

    expect(map.entities).toHaveLength(0);
    expect(map.blocks.edits.filter((edit) => edit.blockId === BLOCK_IDS.Ground)).toHaveLength(groundEditsBefore);
  });

  it("all existing prefab IDs remain valid and unique (11)", () => {
    const ids = new Set<string>();
    for (const prefab of BUILT_IN_PREFABS) {
      expect(ids.has(prefab.id)).toBe(false);
      ids.add(prefab.id);
    }
    expect(BUILT_IN_PREFABS.length).toBe(ids.size);
  });
});
