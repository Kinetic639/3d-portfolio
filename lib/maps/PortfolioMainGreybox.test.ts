import { describe, expect, it } from "vitest";
import { getPrefabDefinition } from "@/lib/prefabs/prefab-library";
import { resolvePrefabVisualBounds } from "@/lib/prefabs/prefab-resolver";
import { parseMapDocument } from "@/lib/world/map-document";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { getTerrainSurfaceAtWorld } from "@/lib/world/surface-query";
import {
  cloneMapDefinition,
  createLoadedMapState,
  mapDefinitionToDocument,
  validateMapDefinition,
} from "./map-definition";
import { loadMapStateSync, listMapRegistryEntries } from "./map-registry";

const MAP_ID = "portfolio-main-greybox-v1";
const REQUIRED_ZONES = ["projects", "experience", "about", "skills", "contact"];
const REQUIRED_MARKERS = [
  "project-featured",
  "project-01",
  "project-02",
  "project-03",
  "project-04",
  "project-more",
  "experience-start",
  "experience-milestone-01",
  "experience-milestone-02",
  "experience-milestone-03",
  "experience-current",
  "experience-education",
  "about-introduction",
  "about-profile",
  "about-values",
  "about-cv",
  "about-workspace",
  "skills-overview",
  "skills-frontend",
  "skills-backend",
  "skills-tooling",
  "skills-design",
  "skills-other",
  "contact-main",
  "contact-form",
  "contact-email",
  "contact-linkedin",
  "contact-github",
  "contact-cv",
];

describe("portfolio main greybox map", () => {
  it("is registered as a normal map without removing existing maps", () => {
    const entries = listMapRegistryEntries({ includeDevelopment: true });
    expect(entries.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      MAP_ID,
      "portfolio-main-greybox-v1-basic-backup",
      "portfolio-phase4",
      "phase49-prefab-density-test",
      "phase49-prefab-maximum-stress",
    ]));
    expect(entries.find((entry) => entry.id === MAP_ID)?.developmentOnly).toBeFalsy();
    expect(entries.find((entry) => entry.id === "portfolio-main-greybox-v1-basic-backup")?.developmentOnly).toBe(true);
  });

  it("loads through the standard map loader and preserves the authoritative dimensions", () => {
    const state = loadMapStateSync(MAP_ID, { includeDevelopment: true });
    expect(state.definition.dimensions).toEqual({ width: 64, height: 12, depth: 64 });
    expect(state.world.getStats().logicalCells).toBe(64 * 64 * 12);
    expect(validateMapDefinition(state.definition).ok).toBe(true);
  });

  it("preserves the central four loader cells as permanent non-air path cells", () => {
    const { world } = loadMapStateSync(MAP_ID, { includeDevelopment: true });
    for (const coordinate of [{ x: 31, z: 31 }, { x: 32, z: 31 }, { x: 31, z: 32 }, { x: 32, z: 32 }]) {
      expect(world.getBlock(coordinate.x, 0, coordinate.z)).toBe(BLOCK_IDS.Path);
      expect(world.getBlock(coordinate.x, 0, coordinate.z)).not.toBe(BLOCK_IDS.Air);
    }
  });

  it("contains all required zones and primary interaction markers", () => {
    const map = loadMapStateSync(MAP_ID, { includeDevelopment: true }).definition;
    expect(map.zones.map((zone) => zone.id)).toEqual(expect.arrayContaining(REQUIRED_ZONES));
    expect(new Set(map.zones.map((zone) => zone.numericId)).size).toBe(map.zones.length);
    expect(map.markers.map((marker) => marker.id)).toEqual(expect.arrayContaining(REQUIRED_MARKERS));
    for (const zoneId of REQUIRED_ZONES) {
      expect(map.markers.some((marker) => marker.zoneId === zoneId)).toBe(true);
    }
  });

  it("connects all primary zones to the central navigation path network", () => {
    const navigation = loadMapStateSync(MAP_ID, { includeDevelopment: true }).definition.navigation;
    const nodeIds = new Set(navigation.nodes.map((node) => node.id));
    for (const nodeId of ["nav-center", "nav-projects", "nav-experience", "nav-about", "nav-skills", "nav-contact"]) {
      expect(nodeIds.has(nodeId)).toBe(true);
    }
    for (const zoneId of REQUIRED_ZONES) {
      const zoneNode = navigation.nodes.find((node) => node.zoneId === zoneId);
      expect(zoneNode).toBeTruthy();
      expect(navigation.edges.some((edge) => edge.fromNodeId === "nav-center" && edge.toNodeId === zoneNode?.id || edge.toNodeId === "nav-center" && edge.fromNodeId === zoneNode?.id)).toBe(true);
    }
  });

  it("uses resolvable prefabs and valid in-bounds transforms", () => {
    const map = loadMapStateSync(MAP_ID, { includeDevelopment: true }).definition;
    const ids = new Set<string>();
    const zoneIds = new Set(map.zones.map((zone) => zone.id));
    const markerIds = new Set(map.markers.map((marker) => marker.id));
    for (const entity of map.entities) {
      expect(ids.has(entity.id)).toBe(false);
      ids.add(entity.id);
      expect(entity.entityType).toBe("prefab");
      expect(getPrefabDefinition(entity.prefabId ?? "")).toBeTruthy();
      expect(entity.transform.position.x).toBeGreaterThanOrEqual(-32);
      expect(entity.transform.position.x).toBeLessThanOrEqual(32);
      expect(entity.transform.position.z).toBeGreaterThanOrEqual(-32);
      expect(entity.transform.position.z).toBeLessThanOrEqual(32);
      expect(entity.transform.position.y).toBeGreaterThanOrEqual(0.5);
      expect(entity.transform.position.y).toBeLessThanOrEqual(4.5);
      if (entity.zoneId) expect(zoneIds.has(entity.zoneId)).toBe(true);
      if (entity.markerId) expect(markerIds.has(entity.markerId)).toBe(true);
      expect(entity.tags).toContain("portfolio-main");
    }
  });

  it("meets the authored grey-box hierarchy and prefab-diversity targets", () => {
    const map = loadMapStateSync(MAP_ID, { includeDevelopment: true }).definition;
    const prefabFamilies = new Set(map.entities.map((entity) => entity.prefabId).filter(Boolean));
    const centralHub = map.entities.filter((entity) => entity.tags.includes("arrival"));
    const structures = map.entities.filter((entity) => entity.tags.includes("structure") || entity.tags.includes("landmark"));
    const vegetation = map.entities.filter((entity) => entity.tags.includes("vegetation"));
    const infrastructure = map.entities.filter((entity) => entity.tags.includes("infrastructure"));
    const interactive = map.entities.filter((entity) => entity.tags.includes("interactive-stationary"));

    expect(map.entities.length).toBeGreaterThanOrEqual(300);
    expect(map.entities.length).toBeLessThanOrEqual(550);
    expect(centralHub.length).toBeGreaterThanOrEqual(20);
    expect(structures.length).toBeGreaterThanOrEqual(12);
    expect(vegetation.length).toBeGreaterThanOrEqual(45);
    expect(infrastructure.length).toBeGreaterThanOrEqual(60);
    expect(interactive.length).toBeGreaterThanOrEqual(40);
    expect(prefabFamilies.size).toBeGreaterThanOrEqual(40);
    expect([...prefabFamilies]).toEqual(expect.arrayContaining([
      "central-orientation-monument",
      "portfolio-workshop-compound",
      "timeline-arch",
      "personal-studio-compound",
      "skill-branch-landmark",
      "communication-station",
    ]));
  });

  it("keeps major placements supported by terrain and primary paths clear of blocking landmarks", () => {
    const state = loadMapStateSync(MAP_ID, { includeDevelopment: true });
    const pathSamples = [
      { x: 31, z: 31 },
      { x: 27, z: 27 },
      { x: 36, z: 26 },
      { x: 39, z: 33 },
      { x: 32, z: 40 },
      { x: 25, z: 36 },
    ];
    for (const sample of pathSamples) {
      expect(state.world.getBlock(sample.x, state.world.getHighestNonAirY(sample.x, sample.z) ?? 0, sample.z)).toBe(BLOCK_IDS.Path);
    }

    for (const entity of state.definition.entities.filter((candidate) => candidate.tags.includes("landmark"))) {
      const surface = getTerrainSurfaceAtWorld(state.world, entity.transform.position);
      expect(surface.valid).toBe(true);
      if (!surface.valid) continue;
      expect(resolvePrefabVisualBounds(entity)?.minY).toBeCloseTo(surface.surfaceY, 3);
    }
  });

  it("survives clone and document round trips", () => {
    const map = loadMapStateSync(MAP_ID, { includeDevelopment: true }).definition;
    const clone = cloneMapDefinition(map);
    expect(clone).toEqual(map);

    const document = mapDefinitionToDocument(map);
    const parsed = parseMapDocument(document);
    const reloaded = createLoadedMapState(map);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document.edits).toEqual(document.edits);
    expect(parsed.document.zones).toEqual(document.zones);
    expect(parsed.document.entities).toEqual([...document.entities].sort((a, b) => a.id.localeCompare(b.id)));
    expect(reloaded.definition.entities.map((entity) => entity.id)).toEqual(map.entities.map((entity) => entity.id));
  });
});
