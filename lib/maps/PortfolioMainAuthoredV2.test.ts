import { describe, expect, it } from "vitest";
import { getPrefabDefinition } from "@/lib/prefabs/prefab-library";
import { resolvePrefabVisualBounds } from "@/lib/prefabs/prefab-resolver";
import { getTerrainSurfaceAtWorld } from "@/lib/world/surface-query";
import { parseMapDocument } from "@/lib/world/map-document";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { WORLD_CONFIG } from "@/lib/world/world-config";
import { SHAPE_IDS } from "@/lib/voxel-shapes/shape-ids";
import { cloneMapDefinition, createLoadedMapState, mapDefinitionToDocument, validateMapDefinition } from "./map-definition";
import { DEFAULT_AUTHORED_MAP_ID, listMapRegistryEntries, loadMapStateSync } from "./map-registry";

const MAP_ID = "portfolio-main-authored-v2";
const PRIMARY_FLAT_MAP_ID = "portfolio-primary-flat";

describe("portfolio main authored v2 map", () => {
  it("keeps authored v2 registered while the flat map is primary", () => {
    const entries = listMapRegistryEntries({ includeDevelopment: true });
    expect(DEFAULT_AUTHORED_MAP_ID).toBe(PRIMARY_FLAT_MAP_ID);
    expect(entries.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      PRIMARY_FLAT_MAP_ID,
      MAP_ID,
      "portfolio-main-greybox-v1",
      "portfolio-v2-prefab-showcase",
    ]));
    expect(entries.find((entry) => entry.id === "portfolio-v2-prefab-showcase")?.developmentOnly).toBe(true);
  });

  it("provides the primary terrain map as a cube-only foundation with the northeast Experience zone", () => {
    const state = loadMapStateSync(PRIMARY_FLAT_MAP_ID, { includeDevelopment: true });
    expect(validateMapDefinition(state.definition).ok).toBe(true);
    expect(state.definition.name).toBe("Portfolio Primary Terrain");
    expect(state.world.config).toEqual(WORLD_CONFIG);
    expect(state.world.getStats().nonAirBlocks).toBeGreaterThan(64 * 64);
    expect(state.definition.entities).toHaveLength(0);
    expect(state.definition.markers).toHaveLength(0);
    expect(state.definition.zones).toHaveLength(0);

    let maxTopY = 0;
    for (let z = 0; z < 64; z += 1) {
      for (let x = 0; x < 64; x += 1) {
        expect(state.world.getBlock(x, 0, z)).toBe(BLOCK_IDS.Ground);
        const topY = state.world.getHighestNonAirY(x, z);
        expect(topY).not.toBeNull();
        if (topY == null) throw new Error(`Missing bottom terrain at ${x},${z}`);
        maxTopY = Math.max(maxTopY, topY);
        expect(topY).toBeGreaterThanOrEqual(0);
        expect(topY).toBeLessThanOrEqual(8);
        for (let y = 0; y <= topY; y += 1) {
          expect(state.world.getBlock(x, y, z)).toBe(BLOCK_IDS.Ground);
          expect(state.world.getShape(x, y, z)).toBe(SHAPE_IDS.CUBE);
        }
      }
    }

    expect(state.world.getHighestNonAirY(31, 31)).toBe(0);
    expect(state.world.getHighestNonAirY(32, 31)).toBe(0);
    expect(state.world.getHighestNonAirY(31, 32)).toBe(0);
    expect(state.world.getHighestNonAirY(32, 32)).toBe(0);
    expect(maxTopY).toBe(8);
    expect(state.world.getHighestNonAirY(38, 29)).toBeGreaterThanOrEqual(1);
    expect(state.world.getHighestNonAirY(47, 20)).toBeGreaterThanOrEqual(3);
    expect(state.world.getHighestNonAirY(61, 8)).toBe(8);
    expect(state.world.getHighestNonAirY(12, 49)).toBe(1);
    expect(state.world.getHighestNonAirY(47, 53)).toBe(0);
    expect(state.world.getHighestNonAirY(44, 40)).toBe(0);
  });

  it("uses the portfolio-v2 namespace for every placed prefab", () => {
    const map = loadMapStateSync(MAP_ID, { includeDevelopment: true }).definition;
    expect(validateMapDefinition(map).ok).toBe(true);
    expect(map.entities.length).toBeGreaterThanOrEqual(120);
    expect(map.entities.length).toBeLessThanOrEqual(360);
    expect(map.entities.every((entity) => entity.prefabId?.startsWith("portfolio-v2-"))).toBe(true);
    for (const prefabId of new Set(map.entities.map((entity) => entity.prefabId))) {
      expect(getPrefabDefinition(prefabId ?? "")).toBeTruthy();
    }
  });

  it("contains required zones, interaction anchors and asymmetric navigation", () => {
    const map = loadMapStateSync(MAP_ID, { includeDevelopment: true }).definition;
    expect(map.zones.map((zone) => zone.id)).toEqual(expect.arrayContaining(["projects", "experience", "about", "skills", "contact"]));
    expect(map.markers.map((marker) => marker.id)).toEqual(expect.arrayContaining([
      "v2-project-featured",
      "v2-project-01",
      "v2-project-02",
      "v2-project-03",
      "v2-project-04",
      "v2-project-05",
      "v2-experience-start",
      "v2-experience-current",
      "v2-about-profile",
      "v2-about-cv",
      "v2-skills-tree",
      "v2-skills-frontend",
      "v2-skills-backend",
      "v2-skills-tooling",
      "v2-skills-design",
      "v2-contact-main",
      "v2-contact-form",
      "v2-contact-email",
      "v2-contact-github",
      "v2-contact-linkedin",
      "v2-contact-cv",
    ]));
    expect(map.navigation.nodes.some((node) => node.id === "v2-nav-north-cross")).toBe(true);
    expect(map.navigation.nodes.some((node) => node.id === "v2-nav-south-cross")).toBe(true);
  });

  it("keeps loader cells, natural path hierarchy and non-platform terrain variety", () => {
    const { world } = loadMapStateSync(MAP_ID, { includeDevelopment: true });
    for (const coordinate of [{ x: 31, z: 31 }, { x: 32, z: 31 }, { x: 31, z: 32 }, { x: 32, z: 32 }]) {
      expect(world.getBlock(coordinate.x, 0, coordinate.z)).toBe(BLOCK_IDS.Path);
    }
    for (const sample of [{ x: 29, z: 32 }, { x: 25, z: 28 }, { x: 42, z: 20 }, { x: 35, z: 50 }, { x: 20, z: 39 }]) {
      const topY = world.getHighestNonAirY(sample.x, sample.z) ?? 0;
      expect(world.getBlock(sample.x, topY, sample.z)).toBe(BLOCK_IDS.Path);
    }
    const heights = new Set<number>();
    for (let z = 4; z < 60; z += 4) {
      for (let x = 4; x < 60; x += 4) {
        const topY = world.getHighestNonAirY(x, z);
        if (topY !== null) heights.add(topY);
      }
    }
    expect(heights.size).toBeGreaterThanOrEqual(4);
  });

  it("grounds all landmark and structure prefabs on terrain without floating or embedding", () => {
    const state = loadMapStateSync(MAP_ID, { includeDevelopment: true });
    for (const entity of state.definition.entities.filter((candidate) => candidate.tags.includes("landmark") || candidate.tags.includes("structure"))) {
      const surface = getTerrainSurfaceAtWorld(state.world, entity.transform.position);
      expect(surface.valid).toBe(true);
      if (!surface.valid) continue;
      expect(resolvePrefabVisualBounds(entity)?.minY).toBeCloseTo(surface.surfaceY, 3);
    }
  });

  it("survives clone and document round trips", () => {
    const map = loadMapStateSync(MAP_ID, { includeDevelopment: true }).definition;
    expect(cloneMapDefinition(map)).toEqual(map);
    const document = mapDefinitionToDocument(map);
    const parsed = parseMapDocument(document);
    expect(parsed.ok).toBe(true);
    expect(createLoadedMapState(map).definition.entities.map((entity) => entity.id)).toEqual(map.entities.map((entity) => entity.id));
  });
});
