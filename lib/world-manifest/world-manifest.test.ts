import { describe, expect, it } from "vitest";
import {
  WORLD_MANIFEST_DIMENSIONS,
  WORLD_REGION_SLOTS,
  cloneWorldManifest,
  createCenterOnlyWorldManifest,
  parseWorldManifest,
  validateWorldManifest,
  type WorldManifest,
} from "./world-manifest";

function createCompleteManifest(): WorldManifest {
  return {
    ...createCenterOnlyWorldManifest(),
    regions: Object.entries(WORLD_REGION_SLOTS).map(([id, position]) => ({
      id: id as keyof typeof WORLD_REGION_SLOTS,
      ...position,
      mapId: id === "center" ? "portfolio-primary-flat" : `portfolio-${id}`,
      role: id === "center" ? "playable" : "scenery",
    })),
  };
}

describe("world manifest", () => {
  it("parses a center-only compatibility manifest deterministically", () => {
    const parsed = parseWorldManifest(createCenterOnlyWorldManifest());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.manifest.dimensions).toEqual(WORLD_MANIFEST_DIMENSIONS);
    expect(parsed.manifest.regions).toEqual([{
      id: "center",
      gridX: 1,
      gridZ: 1,
      mapId: "portfolio-primary-flat",
      role: "playable",
    }]);
  });

  it("validates a complete manifest and orders regions by grid position", () => {
    const validation = validateWorldManifest(createCompleteManifest(), { requireComplete: true });
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.manifest.regions.map((region) => region.id)).toEqual([
      "north-west", "north", "north-east", "west", "center", "east", "south-west", "south", "south-east",
    ]);
  });

  it("rejects duplicate ids, map references, positions, and invalid playable roles", () => {
    const manifest = createCompleteManifest();
    manifest.regions[0] = { ...manifest.regions[0], id: "center", gridX: 1, gridZ: 1, mapId: "portfolio-primary-flat", role: "playable" };
    const validation = validateWorldManifest(manifest, { requireComplete: true });
    expect(validation.ok).toBe(false);
    expect(validation.ok ? "" : validation.errors.join("\n")).toMatch(/Duplicate world region id|Duplicate region map id|Duplicate region grid position/);
    expect(validation.ok ? "" : validation.errors.join("\n")).toContain("exactly one playable region");
  });

  it("rejects fixed-slot drift and mismatched dimensions", () => {
    const manifest = createCenterOnlyWorldManifest();
    manifest.regions[0].gridX = 0;
    manifest.dimensions.height = 12;
    const validation = validateWorldManifest(manifest);
    expect(validation.ok).toBe(false);
    expect(validation.ok ? "" : validation.errors.join("\n")).toContain("Region center must use grid position 1,1");
    expect(validation.ok ? "" : validation.errors.join("\n")).toContain("dimension height must be 32");
  });

  it("clones without sharing nested manifest data", () => {
    const original = createCenterOnlyWorldManifest();
    const copy = cloneWorldManifest(original);
    copy.regions[0].mapId = "changed-map";
    expect(original.regions[0].mapId).toBe("portfolio-primary-flat");
  });
});
