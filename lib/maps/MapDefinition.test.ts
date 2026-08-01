import { describe, expect, it } from "vitest";
import { createPortfolioPhase4MapDefinition, createTinyExampleMapDefinition } from "./bundled-maps";
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
});
