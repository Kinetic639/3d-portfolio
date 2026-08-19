import { describe, expect, it } from "vitest";
import { createPhase45AuthoringTestMapDefinition, createPortfolioPhase4MapDefinition, createTinyExampleMapDefinition } from "./bundled-maps";
import {
  cloneMapDefinition,
  createBlankMapDefinition,
  createLoadedMapState,
  duplicateMapDefinition,
  validateMapDefinition,
} from "./map-definition";
import { loadMapStateSync, saveMapDraft, validateMapRegistry } from "./map-registry";
import { BLOCK_IDS } from "@/lib/world/block-registry";

describe("map definitions", () => {
  it("validates bundled authored maps and registry uniqueness", () => {
    expect(validateMapRegistry()).toEqual({ ok: true });
    expect(validateMapDefinition(createPortfolioPhase4MapDefinition()).ok).toBe(true);
    expect(validateMapDefinition(createTinyExampleMapDefinition()).ok).toBe(true);
    expect(validateMapDefinition(createPhase45AuthoringTestMapDefinition()).ok).toBe(true);
  });

  it("rejects malformed block, zone, marker and spawn data", () => {
    const map = cloneMapDefinition(createPortfolioPhase4MapDefinition());
    map.blocks.edits.push({ x: 1, y: 1, z: 1, blockId: 999 as never });
    map.zones.push({ ...map.zones[0], id: map.zones[1].id });
    map.markers.push({ ...map.markers[0] });
    map.spawnPoints.push({ ...map.spawnPoints[0] });

    const result = validateMapDefinition(map);
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors.join("\n")).toContain("Unknown block id");
    expect(result.ok ? [] : result.errors.join("\n")).toContain("Duplicate zone id");
    expect(result.ok ? [] : result.errors.join("\n")).toContain("Duplicate marker id");
    expect(result.ok ? [] : result.errors.join("\n")).toContain("Duplicate spawn id");
  });

  it("loads maps with independent voxel storage", () => {
    const first = loadMapStateSync("portfolio-phase4", { includeDevelopment: true });
    const second = loadMapStateSync("portfolio-phase4", { includeDevelopment: true });

    first.world.setBlock(0, 0, 0, BLOCK_IDS.Air);

    expect(first.world.blocks).not.toBe(second.world.blocks);
    expect(second.world.getBlock(0, 0, 0)).not.toBe(BLOCK_IDS.Air);
  });

  it("duplicates and drafts maps without mutating bundled definitions", () => {
    const original = createPortfolioPhase4MapDefinition();
    const duplicate = duplicateMapDefinition(original, "portfolio-phase4-copy", "Portfolio Copy");
    duplicate.blocks.edits.push({ x: 2, y: 1, z: 2, blockId: BLOCK_IDS.Special });

    expect(original.id).toBe("portfolio-phase4");
    expect(duplicate.id).toBe("portfolio-phase4-copy");
    expect(original.blocks.edits).not.toHaveLength(duplicate.blocks.edits.length);

    const backing = new Map<string, string>();
    const storage = {
      setItem: (key: string, value: string) => void backing.set(key, value),
      getItem: (key: string) => backing.get(key) ?? null,
      removeItem: (key: string) => void backing.delete(key),
      clear: () => void backing.clear(),
      key: () => null,
      get length() {
        return backing.size;
      },
    } as Storage;

    const saved = saveMapDraft(storage, duplicate);
    expect(saved.id).toBe("portfolio-phase4-copy");
    expect(original.id).toBe("portfolio-phase4");
  });

  it("supports maps with no zones or markers", () => {
    const map = createBlankMapDefinition({ id: "blank-map", name: "Blank Map" });
    expect(validateMapDefinition(map).ok).toBe(true);
    expect(() => createLoadedMapState(map)).not.toThrow();
  });

  it("migrates older maps with missing Phase 4.5 arrays", () => {
    const legacy = createTinyExampleMapDefinition();
    const input = {
      ...legacy,
      schemaVersion: 1,
      entities: undefined,
      entityGroups: undefined,
      navigation: undefined,
    };

    const result = validateMapDefinition(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.map.schemaVersion).toBe(4);
      expect(result.map.dimensions).toEqual({ width: 64, depth: 64, minY: -12, height: 32 });
      expect(result.map.fluids).toMatchObject({ encoding: "fluid-sources-v1", sources: [] });
      expect(result.map.entities).toEqual([]);
      expect(result.map.entityGroups).toEqual([]);
      expect(result.map.navigation).toEqual({ nodes: [], edges: [], routes: [] });
    }
  });

  it("rejects invalid entity and navigation references", () => {
    const map = createPhase45AuthoringTestMapDefinition();
    map.entities.push({ ...map.entities[0], id: "bad-entity", zoneId: "missing-zone" });
    map.navigation.edges.push({ id: "bad-edge", fromNodeId: "missing-node", toNodeId: "walk-a", bidirectional: true, locked: false });
    map.navigation.routes.push({ id: "bad-route", name: "Bad route", nodeIds: ["walk-a", "missing-node"], tags: [] });

    const result = validateMapDefinition(map);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.errors.join("\n")).toContain("unknown zone");
    expect(result.ok ? "" : result.errors.join("\n")).toContain("unknown from node");
    expect(result.ok ? "" : result.errors.join("\n")).toContain("unknown node");
  });

  it("round-trips complete Phase 4.5 map data through clone, duplicate and draft storage", () => {
    const map = createPhase45AuthoringTestMapDefinition();
    const duplicate = duplicateMapDefinition(map, "phase45-authoring-test-copy", "Phase 4.5 Copy");
    duplicate.entities[0].name = "Changed";
    duplicate.navigation.nodes[0].position.x = 99;

    expect(map.entities[0].name).not.toBe("Changed");
    expect(map.navigation.nodes[0].position.x).not.toBe(99);

    const backing = new Map<string, string>();
    const storage = {
      setItem: (key: string, value: string) => void backing.set(key, value),
      getItem: (key: string) => backing.get(key) ?? null,
      removeItem: (key: string) => void backing.delete(key),
      clear: () => void backing.clear(),
      key: () => null,
      get length() {
        return backing.size;
      },
    } as Storage;

    const saved = saveMapDraft(storage, map);
    const parsed = validateMapDefinition(JSON.parse(backing.get(`portfolio-map-definition-draft.v1:${map.id}`) ?? "{}"));
    expect(saved.entities).toHaveLength(map.entities.length);
    expect(parsed.ok).toBe(true);
  });
});
