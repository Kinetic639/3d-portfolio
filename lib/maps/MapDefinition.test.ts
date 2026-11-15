import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import { resolveContentReference } from "@/lib/content/content";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import {
  createBlankMapDefinition,
  createLoadedMapState,
  createMapDefinitionFromWorld,
  expandMapWithBackdrop,
  MAP_DEFINITION_SCHEMA_VERSION,
  migrateMapDefinition,
  serializeMapDefinition,
  validateMapDefinition,
  type MapContentReference,
  type MapDefinition,
} from "./map-definition";
import { createPlacedEntity } from "./map-entities";
import { deleteMap, listMaps, readMap, readMapIndex, setDefaultMapId, writeMap } from "./map-store";

const hasContent = (reference: MapContentReference) => resolveContentReference(PORTFOLIO_CONTENT, reference) !== null;
const identityTransform = (x: number, y: number, z: number) => ({
  position: { x, y, z },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
});

function legacyV4Map(): Record<string, unknown> {
  return {
    schemaVersion: 4,
    id: "legacy",
    name: "Legacy",
    kind: "portfolio",
    runtimeMode: "dynamic-voxel",
    dimensions: { width: 64, minY: -12, height: 32, depth: 64 },
    blockSize: 1,
    blocks: { encoding: "cell-edits-v2", generator: "flat-v1", edits: [{ x: 3, y: 1, z: 4, blockId: BLOCK_IDS.Ground }] },
    fluids: { encoding: "fluid-sources-v1", settings: { infiniteSources: true }, sources: [{ x: 1, y: 1, z: 1, fluidId: 1 }] },
    zoneAssignments: [{ x: 3, z: 4, zoneId: 1 }],
    zones: [{ id: "projects", numericId: 1, label: "Projects", color: "#3366aa", displayOrder: 0, visibleInLegend: true, overlayVisible: true, locked: false }],
    markers: [],
    entities: [],
    entityGroups: [],
    navigation: { nodes: [], edges: [], routes: [] },
    spawnPoints: [{ id: "arrival", label: "Arrival", position: { x: 31, y: 1, z: 31 }, rotationY: 0 }],
    cameraPresets: [],
    defaultSpawnId: "arrival",
    presentation: { legendVisible: true },
    metadata: {},
  };
}

describe("map definition v5", () => {
  it("creates a valid blank map with configurable dimensions", () => {
    const map = createBlankMapDefinition({ id: "blank", name: "Blank", width: 96, depth: 32 });
    expect(map.schemaVersion).toBe(MAP_DEFINITION_SCHEMA_VERSION);
    expect(map.dimensions).toMatchObject({ width: 96, depth: 32 });
    expect(map.playableBounds).toEqual({ minX: 0, minZ: 0, maxX: 95, maxZ: 31 });
    expect(map.blocks.edits).toEqual([]);
    expect(validateMapDefinition(map).ok).toBe(true);
  });

  it("migrates a v4 file: drops removed fields and fills new ones", () => {
    const migrated = migrateMapDefinition(legacyV4Map());
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated).not.toHaveProperty("fluids");
    expect(migrated).not.toHaveProperty("runtimeMode");
    expect(migrated).not.toHaveProperty("blockSize");
    expect(migrated.playableBounds).toEqual({ minX: 0, minZ: 0, maxX: 63, maxZ: 63 });
    expect(migrated.environment.timeOfDay).toBeGreaterThan(0);
    expect(validateMapDefinition(migrated).ok).toBe(true);
  });

  it("rejects files from a newer schema and non-map input", () => {
    expect(() => migrateMapDefinition({ ...legacyV4Map(), schemaVersion: 99 })).toThrow(/newer/);
    expect(validateMapDefinition("nope")).toMatchObject({ ok: false });
    expect(validateMapDefinition({ schemaVersion: 5 })).toMatchObject({ ok: false });
  });

  it("round-trips a world through edits and back", () => {
    const legacy = migrateMapDefinition(legacyV4Map());
    const { world } = createLoadedMapState(legacy);
    expect(world.getBlock(3, 1, 4)).toBe(BLOCK_IDS.Ground);
    expect(world.getColumnZone(3, 4)).toBe(1);
    world.setBlock(10, 2, 10, BLOCK_IDS.Stone);

    const saved = createMapDefinitionFromWorld({
      id: "roundtrip", name: "Roundtrip", kind: "test", world,
      zones: legacy.zones, markers: [], spawnPoints: [], cameraPresets: [],
    });
    expect(saved.blocks.edits).toEqual([
      { x: 3, y: 1, z: 4, blockId: BLOCK_IDS.Ground },
      { x: 10, y: 2, z: 10, blockId: BLOCK_IDS.Stone },
    ]);
    const reloaded = createLoadedMapState(saved).world;
    expect(reloaded.blocks).toEqual(world.blocks);
    expect(reloaded.zones).toEqual(world.zones);
  });

  it("keeps world statistics exact without scanning", () => {
    const { world } = createLoadedMapState(createBlankMapDefinition({ id: "stats", name: "Stats" }));
    const before = world.getStats();
    world.setBlock(5, 3, 5, BLOCK_IDS.Ground);
    world.setBlock(5, 0, 5, BLOCK_IDS.Air);
    world.setBlock(6, 3, 5, BLOCK_IDS.Ground);
    world.setColumnZone(1, 1, 2);
    world.setColumnZone(1, 1, 3);
    world.setColumnZone(2, 2, 0);
    const after = world.getStats();
    expect(after.nonAirBlocks).toBe(before.nonAirBlocks + 1);
    expect(after.airCells).toBe(before.airCells - 1);
    expect(after.zoneAssignments).toBe(before.zoneAssignments + 1);
    expect(world.clone().getStats()).toEqual(after);
  });

  it("adds backdrop margin while preserving terrain and world positions", () => {
    const source = migrateMapDefinition(legacyV4Map());
    source.entities = [createPlacedEntity({ id: "crate", transform: identityTransform(2, 1, -3) })];
    const expanded = expandMapWithBackdrop(source, { west: 64, east: 64, north: 64, south: 64 });

    expect(expanded.dimensions).toMatchObject({ width: 192, depth: 192 });
    expect(expanded.playableBounds).toEqual({ minX: 64, minZ: 64, maxX: 127, maxZ: 127 });
    expect(validateMapDefinition(expanded).ok).toBe(true);

    const before = createLoadedMapState(source).world;
    const after = createLoadedMapState(expanded).world;
    for (const [x, y, z] of [[3, 1, 4], [31, 0, 31], [32, 0, 32], [0, 0, 0], [63, -5, 63]]) {
      expect(after.getBlock(x + 64, y, z + 64)).toBe(before.getBlock(x, y, z));
      // Symmetric margins keep every cell at the same world-space position.
      expect(after.gridToWorld(x + 64, y, z + 64)).toEqual(before.gridToWorld(x, y, z));
    }
    expect(after.getColumnZone(3 + 64, 4 + 64)).toBe(1);
    expect(expanded.entities[0].transform.position).toEqual({ x: 2, y: 1, z: -3 });
    expect(expanded.spawnPoints[0].position).toEqual({ x: 95, y: 1, z: 95 });
  });

  it("shifts world-space data for asymmetric backdrop margins", () => {
    const source = migrateMapDefinition(legacyV4Map());
    source.entities = [createPlacedEntity({ id: "crate", transform: identityTransform(2, 1, -3) })];
    const expanded = expandMapWithBackdrop(source, { west: 32, east: 0, north: 0, south: 16 });
    const before = createLoadedMapState(source).world;
    const after = createLoadedMapState(expanded).world;

    for (const [x, z] of [[31, 31], [32, 32], [0, 0], [40, 20]]) {
      expect(after.getBlock(x + 32, 0, z)).toBe(before.getBlock(x, 0, z));
    }
    // The entity must still stand on the same cell it stood on before.
    const cellBefore = before.worldToGrid({ x: 2, y: 1, z: -3 });
    const moved = expanded.entities[0].transform.position;
    expect(after.worldToGrid(moved)).toEqual({ x: cellBefore!.x + 32, y: cellBefore!.y, z: cellBefore!.z });
  });

  it("reports precise validation errors", () => {
    const map = createBlankMapDefinition({ id: "broken", name: "Broken" });
    const result = validateMapDefinition({
      ...map,
      playableBounds: { minX: 10, minZ: 0, maxX: 5, maxZ: 200 },
      blocks: { ...map.blocks, edits: [{ x: 999, y: 0, z: 0, blockId: 1 }, { x: 1, y: 1, z: 1, blockId: 60000 }] },
      zones: [{ id: "dig", numericId: 1, label: "Dig", color: "#aa5500", displayOrder: 0, visibleInLegend: true, overlayVisible: true, locked: false, kind: "minigame" }],
      environment: { timeOfDay: 30, wind: { direction: 0, strength: 0 } },
    } as MapDefinition);
    expect(result.ok).toBe(false);
    const errors = result.ok ? [] : result.errors;
    expect(errors.some((error) => error.includes("Playable bounds"))).toBe(true);
    expect(errors.some((error) => error.includes("inside the map"))).toBe(true);
    expect(errors.some((error) => error.includes("Unknown block id"))).toBe(true);
    expect(errors.some((error) => error.includes("must name a game id"))).toBe(true);
    expect(errors.some((error) => error.includes("Environment"))).toBe(true);
  });

  it("rejects dimensions that are not chunk multiples", () => {
    const map = createBlankMapDefinition({ id: "odd", name: "Odd" });
    expect(validateMapDefinition({ ...map, dimensions: { ...map.dimensions, width: 70 } })).toMatchObject({ ok: false });
  });

  it("flags references to missing portfolio content only when asked to", () => {
    const map = createBlankMapDefinition({ id: "refs", name: "Refs" });
    map.entities = [
      createPlacedEntity({ id: "good", contentReference: { contentType: "project", contentId: "project-placeholder-1" } }),
      createPlacedEntity({ id: "bad", contentReference: { contentType: "project", contentId: "missing" } }),
    ];
    expect(validateMapDefinition(map).ok).toBe(true);
    const result = validateMapDefinition(map, { hasContent });
    expect(result.ok ? [] : result.errors).toEqual(["Entity bad references missing content project:missing."]);
  });

  it("serializes with one block edit per line", () => {
    const map = migrateMapDefinition(legacyV4Map());
    const text = serializeMapDefinition(map);
    expect(text).toContain(`\n      {"x":3,"y":1,"z":4,"blockId":${BLOCK_IDS.Ground}}\n`);
    expect(text.endsWith("\n")).toBe(true);
    expect(migrateMapDefinition(JSON.parse(text))).toEqual(map);
  });
});

describe("map store", () => {
  function tempRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "map-store-"));
    fs.mkdirSync(path.join(root, "maps"));
    writeMap(createBlankMapDefinition({ id: "first", name: "First" }), { root });
    fs.writeFileSync(path.join(root, "maps", "index.json"), JSON.stringify({ defaultMapId: "first" }));
    return root;
  }

  it("writes, lists, reads and deletes maps as files", () => {
    const root = tempRoot();
    writeMap(createBlankMapDefinition({ id: "second", name: "Second" }), { root });
    expect(listMaps(root)).toEqual([
      { id: "first", name: "First", description: undefined, isDefault: true },
      { id: "second", name: "Second", description: undefined, isDefault: false },
    ]);
    expect(readMap("second", root).name).toBe("Second");
    deleteMap("second", root);
    expect(listMaps(root).map((map) => map.id)).toEqual(["first"]);
  });

  it("changes the default map and protects it from deletion", () => {
    const root = tempRoot();
    writeMap(createBlankMapDefinition({ id: "second", name: "Second" }), { root });
    expect(() => setDefaultMapId("missing", root)).toThrow(/does not exist/);
    setDefaultMapId("second", root);
    expect(readMapIndex(root).defaultMapId).toBe("second");
    expect(() => deleteMap("second", root)).toThrow(/default map/);
  });

  it("refuses invalid maps and unsafe ids", () => {
    const root = tempRoot();
    expect(() => readMap("../secrets", root)).toThrow(/Invalid map id/);
    expect(() => writeMap(createBlankMapDefinition({ id: "broken", name: "" }), { root })).toThrow(/name is required/);
  });

  it("ships a valid default map whose content references all resolve", () => {
    const { defaultMapId } = readMapIndex();
    const result = validateMapDefinition(readMap(defaultMapId), { hasContent });
    expect(result.ok ? [] : result.errors).toEqual([]);
  });
});
