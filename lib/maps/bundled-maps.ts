import { BLOCK_IDS, type BlockId } from "@/lib/world/block-registry";
import { VoxelWorld } from "@/lib/world/voxel-world";
import { WORLD_CONFIG } from "@/lib/world/world-config";
import {
  createBlankMapDefinition,
  createDefaultOverviewCameraPreset,
  createMapDefinitionFromWorld,
  type MapCameraPreset,
  type MapDefinition,
  type MapMarkerDefinition,
  type MapZoneDefinition,
} from "./map-definition";
import { createPlacedEntity, type EntityGroupDefinition, type PlacedMapEntity } from "./map-entities";
import type { MapNavigationDefinition } from "./map-navigation";
import { BUILT_IN_PREFABS } from "@/lib/prefabs/prefab-library";
import type { PrefabDefinition, PrefabVariantDefinition } from "@/lib/prefabs/prefab-types";

const PHASE4_CREATED_AT = "2026-08-01T00:00:00.000Z";

export function createPortfolioPhase4MapDefinition(): MapDefinition {
  const world = createPhase4GrayBoxWorld();
  const zones = createPhase4Zones();
  const markers = createPhase4Markers();
  const cameraPresets = createPhase4CameraPresets();

  return createMapDefinitionFromWorld({
    id: "portfolio-phase4",
    name: "Portfolio Phase 4",
    description: "Editable gray-box integration map for portfolio browsing, content binding and map-management workflows.",
    kind: "portfolio",
    runtimeMode: "baked-static",
    world,
    zones,
    markers,
    spawnPoints: [{
      id: "overview",
      label: "Overview",
      position: { x: 31, y: 1, z: 31 },
      rotationY: 0,
      cameraTarget: { x: 31, y: 0, z: 31 },
    }],
    cameraPresets,
    defaultSpawnId: "overview",
    defaultCameraPresetId: "overview",
    presentation: {
      legendVisible: true,
      backgroundId: "neutral-day",
      environmentId: "graybox",
    },
    metadata: {
      createdAt: PHASE4_CREATED_AT,
      updatedAt: PHASE4_CREATED_AT,
      authoringVersion: "phase-4",
    },
  });
}

export function createTinyExampleMapDefinition(): MapDefinition {
  const world = new VoxelWorld();
  forRect(world, 29, 29, 34, 34, 0, BLOCK_IDS.Ground);
  forRect(world, 30, 30, 33, 33, 0, BLOCK_IDS.Path);
  world.setBlock(31, 1, 31, BLOCK_IDS.Special);
  forRectZone(world, 29, 29, 34, 34, 1, 1);
  preserveCenterPlaza(world);
  world.clearDirtyChunks();

  const zones: MapZoneDefinition[] = [{
    id: "example-zone",
    numericId: 1,
    label: "Example",
    shortLabel: "Example",
    description: "A tiny authored map proving the runtime is not hardcoded to the Phase 4 portfolio map.",
    color: "#38bdf8",
    displayOrder: 1,
    visibleInLegend: true,
    overlayVisible: true,
    locked: false,
    defaultFocusMarkerId: "example-marker",
  }];

  const markers: MapMarkerDefinition[] = [{
    id: "example-marker",
    type: "marker",
    markerType: "info",
    label: "Example marker",
    zoneId: "example-zone",
    gridPosition: { x: 31, y: 2, z: 31 },
    rotationY: 0,
    contentReference: { contentType: "about", contentId: "about-placeholder" },
    developmentVisible: true,
    runtimeVisible: true,
    interactionRadius: 1.1,
  }];

  return createMapDefinitionFromWorld({
    id: "tiny-example",
    name: "Tiny Example",
    description: "Small development map with one zone, one marker, one spawn and one camera preset.",
    kind: "test",
    runtimeMode: "dynamic-voxel",
    world,
    zones,
    markers,
    spawnPoints: [{
      id: "overview",
      label: "Overview",
      position: { x: 31, y: 2, z: 31 },
      rotationY: 0,
      cameraTarget: { x: 31, y: 1, z: 31 },
    }],
    cameraPresets: [createDefaultOverviewCameraPreset()],
    defaultSpawnId: "overview",
    defaultCameraPresetId: "overview",
    presentation: { legendVisible: true, backgroundId: "neutral-day", environmentId: "graybox" },
    metadata: {
      createdAt: PHASE4_CREATED_AT,
      updatedAt: PHASE4_CREATED_AT,
      authoringVersion: "phase-4",
    },
  });
}

export function createPhase45AuthoringTestMapDefinition(): MapDefinition {
  const world = new VoxelWorld();
  forRect(world, 26, 26, 37, 37, 0, BLOCK_IDS.Ground);
  forRect(world, 30, 24, 33, 39, 0, BLOCK_IDS.Path);
  forRect(world, 24, 30, 39, 33, 0, BLOCK_IDS.Path);
  addSimpleMass(world, 26, 26, 29, 29, 1, BLOCK_IDS.ZoneGround);
  world.setBlock(36, 36, 0, BLOCK_IDS.Air);
  forRectZone(world, 26, 26, 37, 37, 0, 1);
  preserveCenterPlaza(world);
  world.clearDirtyChunks();

  const zones: MapZoneDefinition[] = [{
    id: "authoring-zone",
    numericId: 1,
    label: "Authoring Zone",
    shortLabel: "Tools",
    description: "Development-only fixture for reusable map-authoring tools.",
    color: "#22c55e",
    displayOrder: 1,
    visibleInLegend: true,
    overlayVisible: true,
    locked: false,
    defaultFocusMarkerId: "authoring-marker",
  }];

  const markers: MapMarkerDefinition[] = [{
    id: "authoring-marker",
    type: "marker",
    markerType: "info",
    label: "Authoring Marker",
    zoneId: "authoring-zone",
    gridPosition: { x: 31, y: 1, z: 31 },
    rotationY: 0,
    developmentVisible: true,
    runtimeVisible: true,
    interactionRadius: 1.1,
  }];

  const entities: PlacedMapEntity[] = [
    createAuthoringEntity("box-building", "Box building", "box", -3, 1.55, -3, "#6f8492", "blocking", { x: 3, y: 2.1, z: 3 }, "authoring-zone"),
    createAuthoringEntity("desk-placeholder", "Desk placeholder", "box", 3, 1.05, -3, "#86735c", "blocking", { x: 2, y: 1, z: 1 }, "authoring-zone"),
    createAuthoringEntity("tree-trunk", "Tree trunk", "cylinder", -4, 1.35, 4, "#4c5d54", "blocking", { x: 0.55, y: 1.7, z: 0.55 }, "authoring-zone", "tree-group"),
    createAuthoringEntity("tree-canopy", "Tree canopy", "sphere", -4, 2.65, 4, "#22c55e", "none", { x: 1.5, y: 1.5, z: 1.5 }, "authoring-zone", "tree-group"),
    createAuthoringEntity("non-blocking-decoration", "Non-blocking decoration", "sphere", 4, 1.2, 4, "#f59e0b", "none", { x: 0.8, y: 0.8, z: 0.8 }, "authoring-zone"),
    createPlacedEntity({
      id: "section-sign",
      name: "Section sign",
      entityType: "sign",
      primitiveType: "sign",
      transform: {
        position: { x: 0, y: 1.2, z: -4 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1.4, y: 1, z: 1 },
      },
      appearance: { color: "#d8b45a", visibleAtRuntime: true, visibleInEditor: true },
      footprint: { width: 1.4, depth: 0.25, height: 1.2 },
      collisionMode: "trigger",
      zoneId: "authoring-zone",
      markerId: "authoring-marker",
      contentReference: { contentType: "about", contentId: "about-placeholder" },
      tags: ["fixture", "sign"],
      sign: { label: "Authoring", subtitle: "Fixture", arrow: "forward" },
    }),
  ];

  const entityGroups: EntityGroupDefinition[] = [{ id: "tree-group", name: "Grouped tree proxy", locked: false, hidden: false }];
  const navigation: MapNavigationDefinition = {
    nodes: [
      { id: "walk-a", type: "walk", label: "Walk A", position: { x: -1, y: 1, z: -1 }, zoneId: "authoring-zone", tags: [], locked: false },
      { id: "junction-a", type: "route-junction", label: "Junction A", position: { x: 1, y: 1, z: -1 }, zoneId: "authoring-zone", tags: [], locked: false },
      { id: "wait-a", type: "wait-point", label: "Wait A", position: { x: 1, y: 1, z: 1 }, zoneId: "authoring-zone", tags: [], locked: false },
    ],
    edges: [{ id: "walk-junction", fromNodeId: "walk-a", toNodeId: "junction-a", bidirectional: true, cost: 1, routeTag: "fixture", locked: false }],
    routes: [{ id: "fixture-route", name: "Fixture route", nodeIds: ["walk-a", "junction-a", "wait-a"], tags: ["fixture"] }],
  };

  return {
    ...createMapDefinitionFromWorld({
      id: "phase45-authoring-test",
      name: "Phase 4.5 Authoring Test",
      description: "Development-only authoring fixture built from generic terrain, entity and navigation data.",
      kind: "test",
      runtimeMode: "dynamic-voxel",
      world,
      zones,
      markers,
      spawnPoints: [{
        id: "authoring-spawn",
        label: "Authoring Spawn",
        position: { x: 31, y: 1, z: 31 },
        rotationY: 0,
        cameraTarget: { x: 31, y: 0, z: 31 },
      }],
      cameraPresets: [{
        ...createDefaultOverviewCameraPreset(),
        id: "authoring-overview",
        label: "Authoring Overview",
      }],
      defaultSpawnId: "authoring-spawn",
      defaultCameraPresetId: "authoring-overview",
      presentation: { legendVisible: true, backgroundId: "neutral-day", environmentId: "graybox" },
      metadata: {
        createdAt: PHASE4_CREATED_AT,
        updatedAt: PHASE4_CREATED_AT,
        authoringVersion: "phase-4.5",
      },
    }),
    entities,
    entityGroups,
    navigation,
  };
}

export function createPrefabCatalogMapDefinition(): MapDefinition {
  return createPrefabFixtureMap({
    id: "phase49-prefab-catalog",
    name: "Phase 4.9 Prefab Catalog",
    description: "Development-only catalog map containing every built-in gray-box prefab and its authored variants.",
    entities: createCatalogPrefabEntities(),
    authoringVersion: "phase-4.9",
  });
}

export function createPrefabDensityTestMapDefinition(): MapDefinition {
  const prefabs = ["bench", "lamp-post", "deciduous-tree", "section-sign", "square-platform"]
    .map((id) => BUILT_IN_PREFABS.find((prefab) => prefab.id === id))
    .filter((prefab): prefab is PrefabDefinition => Boolean(prefab));
  const entities: PlacedMapEntity[] = [];
  for (let z = -24; z <= 24; z += 4) {
    for (let x = -24; x <= 24; x += 4) {
      const prefab = prefabs[Math.abs(x + z + entities.length) % prefabs.length];
      entities.push(createPrefabMapEntity(prefab, prefab.defaultVariantId, `density-${entities.length}`, x, z, ((entities.length % 4) * Math.PI) / 2));
    }
  }

  return createPrefabFixtureMap({
    id: "phase49-prefab-density-test",
    name: "Phase 4.9 Prefab Density Test",
    description: "Moderately dense reusable-prefab fixture representative of an authored portfolio map.",
    entities,
    authoringVersion: "phase-4.9",
  });
}

export function createPrefabRepetitionStressMapDefinition(): MapDefinition {
  const prefab = BUILT_IN_PREFABS.find((candidate) => candidate.id === "lamp-post") ?? BUILT_IN_PREFABS[0];
  const entities: PlacedMapEntity[] = [];
  for (let z = -30; z <= 30; z += 2) {
    for (let x = -30; x <= 30; x += 2) {
      entities.push(createPrefabMapEntity(prefab, prefab.defaultVariantId, `repeat-${entities.length}`, x, z, 0));
    }
  }

  return createPrefabFixtureMap({
    id: "phase49-prefab-repetition-stress",
    name: "Phase 4.9 Prefab Repetition Stress",
    description: "High-count repeated-prefab fixture for verifying instanced batching efficiency.",
    entities,
    authoringVersion: "phase-4.9",
  });
}

export function createPrefabDiversityStressMapDefinition(): MapDefinition {
  const entities: PlacedMapEntity[] = [];
  for (let z = -28; z <= 28; z += 4) {
    for (let x = -28; x <= 28; x += 4) {
      const prefab = BUILT_IN_PREFABS[entities.length % BUILT_IN_PREFABS.length];
      const variant = prefab.variants[entities.length % prefab.variants.length];
      entities.push(createPrefabMapEntity(prefab, variant.id, `diverse-${entities.length}`, x, z, ((entities.length % 4) * Math.PI) / 2));
    }
  }

  return createPrefabFixtureMap({
    id: "phase49-prefab-diversity-stress",
    name: "Phase 4.9 Prefab Diversity Stress",
    description: "Many prefab types and material roles for checking batching under high visual variety.",
    entities,
    authoringVersion: "phase-4.9",
  });
}

export function createPrefabMaximumEntityStressMapDefinition(): MapDefinition {
  const entities: PlacedMapEntity[] = [];
  for (let z = -31; z <= 31; z += 2) {
    for (let x = -31; x <= 31; x += 2) {
      const prefab = BUILT_IN_PREFABS[entities.length % BUILT_IN_PREFABS.length];
      const variant = prefab.variants[entities.length % prefab.variants.length];
      entities.push(createPrefabMapEntity(prefab, variant.id, `max-prefab-${entities.length}`, x, z, ((entities.length % 4) * Math.PI) / 2));
    }
  }

  return createPrefabFixtureMap({
    id: "phase49-prefab-maximum-stress",
    name: "Phase 4.9 Prefab Maximum Stress",
    description: "Maximum-density prefab fixture for production FPS and frame-time stress checks.",
    entities,
    authoringVersion: "phase-4.9",
  });
}

function createAuthoringEntity(
  id: string,
  name: string,
  primitiveType: "box" | "cylinder" | "sphere",
  x: number,
  y: number,
  z: number,
  color: string,
  collisionMode: "none" | "blocking" | "walkable" | "trigger",
  scale: { x: number; y: number; z: number },
  zoneId: string,
  groupId?: string,
) {
  return createPlacedEntity({
    id,
    name,
    primitiveType,
    transform: {
      position: { x, y, z },
      rotation: { x: 0, y: 0, z: 0 },
      scale,
    },
    appearance: { color, visibleAtRuntime: true, visibleInEditor: true },
    footprint: { width: scale.x, depth: scale.z, height: scale.y },
    collisionMode,
    zoneId,
    groupId,
    tags: ["fixture"],
  });
}

function createPrefabFixtureMap(input: { id: string; name: string; description: string; entities: PlacedMapEntity[]; authoringVersion: string }): MapDefinition {
  const map = createBlankMapDefinition({
    id: input.id,
    name: input.name,
    kind: "test",
    runtimeMode: "dynamic-voxel",
    flatBaseLayer: true,
  });

  return {
    ...map,
    description: input.description,
    entities: input.entities,
    metadata: {
      ...map.metadata,
      createdAt: PHASE4_CREATED_AT,
      updatedAt: PHASE4_CREATED_AT,
      authoringVersion: input.authoringVersion,
    },
  };
}

function createCatalogPrefabEntities() {
  const entities: PlacedMapEntity[] = [];
  const placements: Array<{ prefab: PrefabDefinition; variant: PrefabVariantDefinition }> = [];
  for (const prefab of BUILT_IN_PREFABS) {
    placements.push({ prefab, variant: prefab.variants.find((variant) => variant.id === prefab.defaultVariantId) ?? prefab.variants[0] });
    if (prefab.variants.length > 1) {
      placements.push({ prefab, variant: prefab.variants[prefab.variants.length - 1] });
    }
  }

  const columns = 14;
  const spacing = 4.4;
  for (const [index, placement] of placements.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = -28.6 + column * spacing;
    const z = -28.6 + row * spacing;
    if (z > 30) break;
    entities.push(createPrefabMapEntity(placement.prefab, placement.variant.id, `catalog-${placement.prefab.id}-${placement.variant.id}`, x, z, ((index % 4) * Math.PI) / 2));
  }
  return entities;
}

function createPrefabMapEntity(prefab: PrefabDefinition, variantId: string, id: string, x: number, z: number, rotationY: number): PlacedMapEntity {
  const variant = prefab.variants.find((candidate) => candidate.id === variantId) ?? prefab.variants[0];
  return createPlacedEntity({
    id,
    name: `${prefab.name} ${variant.label}`,
    entityType: "prefab",
    primitiveType: "box",
    prefabId: prefab.id,
    prefabVersion: prefab.version,
    variantId: variant.id,
    transform: {
      position: { x, y: 0.5, z },
      rotation: { x: 0, y: rotationY, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    placement: {
      anchor: prefab.placement.anchor,
      snapToGrid: prefab.placement.snapToGrid,
      surfaceAttached: prefab.placement.surfaceAttached,
      surfaceOffset: 0,
    },
    appearance: { color: "#9ca3af", visibleAtRuntime: true, visibleInEditor: true },
    footprint: variant.footprintOverride ?? prefab.footprint,
    collisionMode: prefab.collisionMode,
    assetReference: prefab.futureAssetSlot,
    tags: ["prefab-fixture", prefab.category, ...prefab.tags],
  });
}

function createPhase4GrayBoxWorld() {
  const world = new VoxelWorld();
  forRect(world, 0, 0, 63, 63, 0, BLOCK_IDS.Ground);

  forRect(world, 27, 27, 36, 36, 0, BLOCK_IDS.Path);
  forRect(world, 30, 8, 33, 55, 0, BLOCK_IDS.Path);
  forRect(world, 8, 30, 55, 33, 0, BLOCK_IDS.Path);

  addZonePlatform(world, 6, 8, 20, 22, 1, BLOCK_IDS.ZoneGround);
  addZonePlatform(world, 43, 8, 57, 22, 2, BLOCK_IDS.Special);
  addZonePlatform(world, 6, 42, 20, 56, 3, BLOCK_IDS.Boundary);
  addZonePlatform(world, 43, 42, 57, 56, 4, BLOCK_IDS.ZoneGround);
  addZonePlatform(world, 24, 4, 39, 15, 5, BLOCK_IDS.Special);

  addSimpleMass(world, 9, 11, 17, 20, 2, BLOCK_IDS.ZoneGround);
  addSimpleMass(world, 46, 11, 54, 19, 1, BLOCK_IDS.Special);
  addSimpleMass(world, 9, 45, 18, 53, 3, BLOCK_IDS.Boundary);
  addSimpleMass(world, 46, 45, 54, 53, 2, BLOCK_IDS.ZoneGround);
  addSimpleMass(world, 27, 7, 36, 13, 1, BLOCK_IDS.Special);

  preserveCenterPlaza(world);
  world.clearDirtyChunks();
  return world;
}

function createPhase4Zones(): MapZoneDefinition[] {
  return [
    createZone("projects", 1, "Projects", "Work", "Featured project placeholders and case-study anchors.", "#38bdf8", 1, "projects-primary"),
    createZone("about", 2, "About", "About", "Personal introduction placeholder area.", "#a78bfa", 2, "about-primary"),
    createZone("experience", 3, "Experience", "XP", "Professional timeline placeholder area.", "#f59e0b", 3, "experience-primary"),
    createZone("skills", 4, "Skills", "Skills", "Technology and capability grouping placeholder area.", "#10b981", 4, "skills-primary"),
    createZone("contact", 5, "Contact", "Contact", "Contact and availability placeholder area.", "#ef4444", 5, "contact-primary"),
  ];
}

function createPhase4Markers(): MapMarkerDefinition[] {
  return [
    createMarker("projects-primary", "Featured projects", "projects", 13, 3, 15, { contentType: "project", contentId: "project-placeholder-1" }),
    createMarker("about-primary", "About overview", "about", 50, 2, 15, { contentType: "about", contentId: "about-placeholder" }),
    createMarker("experience-primary", "Experience overview", "experience", 13, 4, 49, { contentType: "experience", contentId: "experience-placeholder-1" }),
    createMarker("skills-primary", "Skills overview", "skills", 50, 3, 49, { contentType: "skillGroup", contentId: "frontend" }),
    createMarker("contact-primary", "Contact point", "contact", 31, 2, 10, { contentType: "contact", contentId: "contact-placeholder" }),
    createMarker("project-secondary-a", "Project placeholder A", "projects", 9, 3, 19, { contentType: "project", contentId: "project-placeholder-2" }, "secondary"),
    createMarker("project-secondary-b", "Project placeholder B", "projects", 18, 3, 11, { contentType: "project", contentId: "project-placeholder-3" }, "secondary"),
  ];
}

function createPhase4CameraPresets(): MapCameraPreset[] {
  return [
    createDefaultOverviewCameraPreset(),
    createCameraPreset("projects-focus", "Projects focus", -23, 26, -18, -18, 1.4, -16),
    createCameraPreset("about-focus", "About focus", 23, 26, -18, 18, 1.4, -16),
    createCameraPreset("experience-focus", "Experience focus", -23, 26, 20, -18, 1.8, 18),
    createCameraPreset("skills-focus", "Skills focus", 23, 26, 20, 18, 1.8, 18),
    createCameraPreset("contact-focus", "Contact focus", 0, 22, -24, 0, 1.2, -22),
  ];
}

function createZone(
  id: string,
  numericId: number,
  label: string,
  shortLabel: string,
  description: string,
  color: string,
  displayOrder: number,
  defaultFocusMarkerId: string,
): MapZoneDefinition {
  return {
    id,
    numericId,
    label,
    shortLabel,
    description,
    color,
    displayOrder,
    visibleInLegend: true,
    overlayVisible: true,
    locked: false,
    defaultFocusMarkerId,
  };
}

function createMarker(
  id: string,
  label: string,
  zoneId: string,
  x: number,
  y: number,
  z: number,
  contentReference: MapMarkerDefinition["contentReference"],
  markerType: MapMarkerDefinition["markerType"] = "primary",
): MapMarkerDefinition {
  return {
    id,
    type: "marker",
    markerType,
    label,
    zoneId,
    gridPosition: { x, y, z },
    rotationY: 0,
    focusCameraPresetId: `${zoneId}-focus`,
    contentReference,
    developmentVisible: true,
    runtimeVisible: true,
    interactionRadius: markerType === "primary" ? 1.4 : 1.1,
  };
}

function createCameraPreset(
  id: string,
  label: string,
  cameraX: number,
  cameraY: number,
  cameraZ: number,
  targetX: number,
  targetY: number,
  targetZ: number,
): MapCameraPreset {
  return {
    id,
    label,
    cameraPosition: { x: cameraX, y: cameraY, z: cameraZ },
    controlsTarget: { x: targetX, y: targetY, z: targetZ },
    transitionDuration: 0.9,
  };
}

function addZonePlatform(world: VoxelWorld, minX: number, minZ: number, maxX: number, maxZ: number, zoneId: number, blockId: BlockId) {
  forRect(world, minX, minZ, maxX, maxZ, 0, blockId);
  forRectZone(world, minX, minZ, maxX, maxZ, 0, zoneId);
}

function addSimpleMass(world: VoxelWorld, minX: number, minZ: number, maxX: number, maxZ: number, height: number, blockId: BlockId) {
  for (let y = 1; y <= height; y += 1) {
    forRect(world, minX, minZ, maxX, maxZ, y, blockId);
  }
}

function forRect(world: VoxelWorld, minX: number, minZ: number, maxX: number, maxZ: number, y: number, blockId: BlockId) {
  for (let z = minZ; z <= maxZ; z += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      world.setBlock(x, y, z, blockId);
    }
  }
}

function forRectZone(world: VoxelWorld, minX: number, minZ: number, maxX: number, maxZ: number, y: number, zoneId: number) {
  for (let z = minZ; z <= maxZ; z += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      world.setZone(x, y, z, zoneId);
    }
  }
}

function preserveCenterPlaza(world: VoxelWorld) {
  for (let z = WORLD_CONFIG.depth / 2 - 1; z <= WORLD_CONFIG.depth / 2; z += 1) {
    for (let x = WORLD_CONFIG.width / 2 - 1; x <= WORLD_CONFIG.width / 2; x += 1) {
      world.setBlock(x, 0, z, BLOCK_IDS.Path);
      world.setZone(x, 0, z, 0);
    }
  }
}
