import { BLOCK_IDS, type BlockId } from "@/lib/world/block-registry";
import { VoxelWorld } from "@/lib/world/voxel-world";
import { WORLD_CONFIG } from "@/lib/world/world-config";
import {
  createBlankMapDefinition,
  createDefaultOverviewCameraPreset,
  createMapDefinitionFromWorld,
  validateMapDefinition,
  type MapCameraPreset,
  type MapDefinition,
  type MapMarkerDefinition,
  type MapZoneDefinition,
} from "./map-definition";
import { createPlacedEntity, type EntityGroupDefinition, type PlacedMapEntity } from "./map-entities";
import type { MapNavigationDefinition } from "./map-navigation";
import { BUILT_IN_PREFABS } from "@/lib/prefabs/prefab-library";
import { groundEntityOnTerrain } from "@/lib/prefabs/prefab-placement";
import type { PrefabDefinition, PrefabVariantDefinition } from "@/lib/prefabs/prefab-types";
import { ROTATIONS, SHAPE_IDS, type CellRotation, type ShapeId } from "@/lib/voxel-shapes/shape-ids";
import portfolioPrimaryFlatMap from "./portfolio-primary-flat.map.json";

const PHASE4_CREATED_AT = "2026-08-01T00:00:00.000Z";
const PHASE5_CREATED_AT = "2026-08-02T00:00:00.000Z";
const PRIMARY_FLAT_CREATED_AT = "2026-08-03T00:00:00.000Z";

type GridXZ = { x: number; z: number };
type PortfolioZoneId = "projects" | "experience" | "about" | "skills" | "contact";
type PortfolioZonePlan = {
  id: PortfolioZoneId;
  numericId: number;
  label: string;
  shortLabel: string;
  color: string;
  description: string;
  center: GridXZ;
  radiusX: number;
  radiusZ: number;
  elevation: number;
  blockId: BlockId;
  markerId: string;
};

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

export function createPortfolioMainGreyboxMapDefinition(): MapDefinition {
  const world = createPortfolioMainGreyboxWorld();
  const zones = createPortfolioMainZones();
  const markers = createPortfolioMainMarkers();
  const entities = createPortfolioMainEntities(world);
  const navigation = createPortfolioMainNavigation();
  const cameraPresets = createPortfolioMainCameraPresets();

  return createMapDefinitionFromWorld({
    id: "portfolio-main-greybox-v1",
    name: "Portfolio Main Greybox v1",
    description: "Dense editable grey-box foundation for the main portfolio world: a central arrival hub, five complete portfolio environments, authored terrain, infrastructure, markers and reusable prefab placeholders.",
    kind: "portfolio",
    runtimeMode: "dynamic-voxel",
    world,
    zones,
    markers,
    entities,
    navigation,
    spawnPoints: [{
      id: "arrival",
      label: "Arrival",
      position: { x: 31, y: 1, z: 31 },
      rotationY: 0,
      cameraTarget: { x: 31, y: 0, z: 31 },
    }],
    cameraPresets,
    defaultSpawnId: "arrival",
    defaultCameraPresetId: "overview",
    presentation: {
      legendVisible: true,
      backgroundId: "neutral-day",
      environmentId: "graybox",
    },
    metadata: {
      createdAt: PHASE5_CREATED_AT,
      updatedAt: PHASE5_CREATED_AT,
      authoringVersion: "phase-5-rich-greybox-v1",
    },
  });
}

export function createPortfolioMainGreyboxBasicBackupMapDefinition(): MapDefinition {
  const world = createPortfolioMainBasicBackupWorld();

  return createMapDefinitionFromWorld({
    id: "portfolio-main-greybox-v1-basic-backup",
    name: "Portfolio Main Greybox v1 Basic Backup",
    description: "Recoverable backup of the initial sparse Phase 5 grey-box map before the rich world-design rebuild.",
    kind: "portfolio",
    runtimeMode: "dynamic-voxel",
    world,
    zones: createPortfolioMainZones(),
    markers: createPortfolioMainMarkers(),
    entities: createPortfolioMainEntities(world, "basic"),
    navigation: createPortfolioMainNavigation(),
    spawnPoints: [{
      id: "arrival",
      label: "Arrival",
      position: { x: 31, y: 1, z: 31 },
      rotationY: 0,
      cameraTarget: { x: 31, y: 0, z: 31 },
    }],
    cameraPresets: createPortfolioMainCameraPresets(),
    defaultSpawnId: "arrival",
    defaultCameraPresetId: "overview",
    presentation: {
      legendVisible: true,
      backgroundId: "neutral-day",
      environmentId: "graybox",
    },
    metadata: {
      createdAt: PHASE5_CREATED_AT,
      updatedAt: PHASE5_CREATED_AT,
      authoringVersion: "phase-5-basic-backup",
    },
  });
}

export function createTerrainShapeShowcaseMapDefinition(): MapDefinition {
  const world = new VoxelWorld();

  for (let z = 0; z < WORLD_CONFIG.depth; z += 1) {
    for (let x = 0; x < WORLD_CONFIG.width; x += 1) {
      world.setBlock(x, 0, z, BLOCK_IDS.Ground);
    }
  }

  const place = (x: number, y: number, z: number, blockId: BlockId, shapeId: ShapeId, rotation: CellRotation = ROTATIONS.NORTH, state = 0) => {
    world.setCell({ x, y, z, blockId, shapeId, rotation, state, zoneId: 0 });
  };

  const rotations = [ROTATIONS.NORTH, ROTATIONS.EAST, ROTATIONS.SOUTH, ROTATIONS.WEST];
  rotations.forEach((rotation, index) => {
    place(8 + index * 2, 1, 10, BLOCK_IDS.Special, SHAPE_IDS.STAIR, rotation);
    place(8 + index * 2, 1, 14, BLOCK_IDS.ZoneGround, SHAPE_IDS.SLOPE_SHALLOW, rotation);
    place(8 + index * 2, 1, 18, BLOCK_IDS.Boundary, SHAPE_IDS.SLOPE_STEEP, rotation);
    place(8 + index * 2, 1, 22, BLOCK_IDS.Special, SHAPE_IDS.SLOPE_OUTER_CORNER, rotation);
    place(8 + index * 2, 1, 26, BLOCK_IDS.Special, SHAPE_IDS.SLOPE_INNER_CORNER, rotation);
    place(8 + index * 2, 1, 30, BLOCK_IDS.Special, SHAPE_IDS.CUT_CORNER, rotation);
  });

  place(20, 1, 10, BLOCK_IDS.ZoneGround, SHAPE_IDS.SLAB, ROTATIONS.NORTH, 0);
  place(22, 1, 10, BLOCK_IDS.ZoneGround, SHAPE_IDS.SLAB, ROTATIONS.NORTH, 1);
  place(24, 1, 10, BLOCK_IDS.ZoneGround, SHAPE_IDS.SLAB, ROTATIONS.NORTH, 2);
  place(30, 1, 10, BLOCK_IDS.Boundary, SHAPE_IDS.WALL);
  place(32, 1, 10, BLOCK_IDS.Boundary, SHAPE_IDS.BEAM, ROTATIONS.NORTH, 0);
  place(34, 1, 10, BLOCK_IDS.Boundary, SHAPE_IDS.BEAM, ROTATIONS.NORTH, 1);
  place(36, 1, 10, BLOCK_IDS.Boundary, SHAPE_IDS.BEAM, ROTATIONS.NORTH, 2);
  place(40, 1, 10, BLOCK_IDS.Special, SHAPE_IDS.PILLAR_BASE);
  place(40, 2, 10, BLOCK_IDS.Special, SHAPE_IDS.PILLAR_MIDDLE);
  place(40, 3, 10, BLOCK_IDS.Special, SHAPE_IDS.PILLAR_CAP);

  [SHAPE_IDS.ROOF_FLAT, SHAPE_IDS.ROOF_SHALLOW, SHAPE_IDS.ROOF_STEEP, SHAPE_IDS.ROOF_OUTER_CORNER, SHAPE_IDS.ROOF_INNER_CORNER].forEach((shapeId, index) => {
    place(8 + index * 3, 1, 42, BLOCK_IDS.Boundary, shapeId);
  });

  place(28, 1, 42, BLOCK_IDS.Special, SHAPE_IDS.FENCE);
  place(31, 1, 42, BLOCK_IDS.Special, SHAPE_IDS.PIPE_SHORT);
  place(34, 1, 42, BLOCK_IDS.Special, SHAPE_IDS.PIPE_LONG, ROTATIONS.NORTH, 0);
  place(37, 1, 42, BLOCK_IDS.Special, SHAPE_IDS.PIPE_LONG, ROTATIONS.NORTH, 2);
  place(40, 1, 42, BLOCK_IDS.Special, SHAPE_IDS.PIPE_CORNER);

  place(15, 1, 31, BLOCK_IDS.Special, SHAPE_IDS.SLAB);
  place(16, 1, 31, BLOCK_IDS.Special, SHAPE_IDS.SLAB, ROTATIONS.NORTH, 1);
  world.clearDirtyChunks();

  return createMapDefinitionFromWorld({
    id: "terrain-shape-showcase",
    name: "Terrain Shape Showcase",
    description: "Development-only diagnostics for registry-driven voxel shapes, chunk boundaries, water and placement supports.",
    kind: "test",
    runtimeMode: "dynamic-voxel",
    world,
    zones: [],
    markers: [],
    spawnPoints: [{ id: "overview", label: "Overview", position: { x: 31, y: 2, z: 31 }, rotationY: 0, cameraTarget: { x: 31, y: 0, z: 31 } }],
    cameraPresets: [createDefaultOverviewCameraPreset()],
    defaultSpawnId: "overview",
    defaultCameraPresetId: "overview",
    presentation: { legendVisible: false, backgroundId: "neutral-day", environmentId: "graybox" },
    metadata: { createdAt: PHASE5_CREATED_AT, updatedAt: PHASE5_CREATED_AT, authoringVersion: "shape-registry-v1" },
  });
}

export function createPortfolioV2PrefabShowcaseMapDefinition(): MapDefinition {
  const map = createBlankMapDefinition({
    id: "portfolio-v2-prefab-showcase",
    name: "Portfolio V2 Prefab Showcase",
    kind: "test",
    runtimeMode: "dynamic-voxel",
    flatBaseLayer: true,
  });
  const v2Prefabs = BUILT_IN_PREFABS.filter((prefab) => prefab.id.startsWith("portfolio-v2-"));
  const entities: PlacedMapEntity[] = [];
  const columns = 14;
  const spacing = 4.4;
  for (const [index, prefab] of v2Prefabs.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = -28.5 + column * spacing;
    const z = -28.5 + row * spacing;
    if (z > 30) break;
    const variant = prefab.variants.find((candidate) => candidate.id === prefab.defaultVariantId) ?? prefab.variants[0];
    entities.push(createPrefabMapEntity(prefab, variant.id, `showcase-${prefab.id}`, x, z, ((index % 4) * Math.PI) / 2));
  }

  return {
    ...map,
    description: "Development-only calibration map for the portfolio-v2 reusable prefab collection.",
    entities,
    metadata: {
      ...map.metadata,
      createdAt: PHASE5_CREATED_AT,
      updatedAt: PHASE5_CREATED_AT,
      authoringVersion: "phase-5-v2-prefab-showcase",
    },
  };
}

export function createPortfolioMainAuthoredV2MapDefinition(): MapDefinition {
  const world = createPortfolioV2World();

  return createMapDefinitionFromWorld({
    id: "portfolio-main-authored-v2",
    name: "Portfolio Main Authored v2",
    description: "Asymmetrical authored Phase 5 portfolio landscape built from the portfolio-v2 prefab collection.",
    kind: "portfolio",
    runtimeMode: "dynamic-voxel",
    world,
    zones: createPortfolioV2Zones(),
    markers: createPortfolioV2Markers(),
    entities: createPortfolioV2Entities(world),
    navigation: createPortfolioV2Navigation(),
    spawnPoints: [{
      id: "arrival",
      label: "Arrival",
      position: { x: 31, y: 1, z: 31 },
      rotationY: 0,
      cameraTarget: { x: 31, y: 0, z: 31 },
    }],
    cameraPresets: createPortfolioV2CameraPresets(),
    defaultSpawnId: "arrival",
    defaultCameraPresetId: "overview",
    presentation: { legendVisible: true, backgroundId: "neutral-day", environmentId: "graybox" },
    metadata: {
      createdAt: PHASE5_CREATED_AT,
      updatedAt: PHASE5_CREATED_AT,
      authoringVersion: "phase-5-authored-v2",
    },
  });
}

export function createPortfolioPrimaryFlatMapDefinition(): MapDefinition {
  return loadBundledMapDefinition(portfolioPrimaryFlatMap, "portfolio-primary-flat.map.json");
}

export function createPortfolioNorthSceneryMapDefinition(): MapDefinition {
  const map = createBlankMapDefinition({
    id: "portfolio-scenery-north",
    name: "Portfolio North Scenery",
    kind: "portfolio",
    runtimeMode: "dynamic-voxel",
    flatBaseLayer: true,
  });

  return {
    ...map,
    description: "Editable voxel source for the northern scenery region.",
    spawnPoints: [],
    cameraPresets: [],
    defaultSpawnId: undefined,
    defaultCameraPresetId: undefined,
    metadata: {
      createdAt: PRIMARY_FLAT_CREATED_AT,
      updatedAt: PRIMARY_FLAT_CREATED_AT,
      authoringVersion: "world-regions-phase-4",
    },
  };
}

function loadBundledMapDefinition(input: unknown, source: string): MapDefinition {
  const validation = validateMapDefinition(input);
  if (!validation.ok) {
    throw new Error(`Bundled map ${source} is invalid:\n${validation.errors.join("\n")}`);
  }
  return validation.map;
}

function createPortfolioPrimaryTerrainWorld() {
  const world = new VoxelWorld();

  for (let z = 0; z < WORLD_CONFIG.depth; z += 1) {
    for (let x = 0; x < WORLD_CONFIG.width; x += 1) {
      const height = getPrimaryTerrainHeight(x, z);
      for (let y = 0; y <= height; y += 1) {
        world.setBlock(x, y, z, BLOCK_IDS.Ground);
      }
    }
  }

  world.clearDirtyChunks();
  return world;
}

function getPrimaryTerrainHeight(x: number, z: number) {
  let height = isPrimaryUpperTerrainCut(x, z) ? 0 : 1;

  height = Math.max(height, getExperienceBaseHeight(x, z));
  height = Math.max(height, getSkillsBaseHeight(x, z));
  height = Math.max(height, getProjectsBaseHeight(x, z));
  height = Math.max(height, getAboutBaseHeight(x, z));
  height = Math.max(height, getContactBaseHeight(x, z));
  height = carvePrimaryTerrainRoutes(x, z, height);
  height = carveMainWaterSystem(x, z, height);
  height = applyArrivalClearing(x, z, height);

  return Math.max(0, Math.min(8, height));
}

function isPrimaryUpperTerrainCut(x: number, z: number) {
  return (
    (x < 5 && z < 12) ||
    (x < 3 && z > 44) ||
    (z < 4 && x > 46) ||
    (x > 60 && z > 42 && z < 56) ||
    (z > 60 && x > 51) ||
    (z > 61 && x > 21 && x < 34) ||
    (x < 2 && z > 22 && z < 35)
  );
}

function getExperienceBaseHeight(x: number, z: number) {
  if (x < 30 || z > 31) return 0;
  if (x < 36 && z < 13) return 0;
  if (x < 37 && z > 26) return 0;
  if (x > 61 && z > 20) return 0;

  const summit = falloff(x, z, 58, 8, 21, 17);
  const shoulder = falloff(x, z, 43, 21, 19, 13);
  const lowerBank = falloff(x, z, 34, 28, 10, 7);
  let height = 2;

  if (summit > 0.28 || shoulder > 0.5 || lowerBank > 0.55) height = 3;
  if (summit > 0.42 || shoulder > 0.68) height = 4;
  if (summit > 0.56) height = 5;
  if (summit > 0.68) height = 6;
  if (summit > 0.78) height = 7;

  if (x >= 56 && x <= 61 && z >= 6 && z <= 10) height = Math.max(height, 8);
  if (x >= 30 && x <= 38 && z >= 25 && z <= 31) height = Math.min(height, 2);

  return height;
}

function getSkillsBaseHeight(x: number, z: number) {
  const gardenFootprint = (
    isInsideAuthoredMask(x, z, 17, 46, 18, 14) ||
    isInsideAuthoredMask(x, z, 25, 42, 10, 9) ||
    (x >= 8 && x <= 30 && z >= 40 && z <= 54)
  );
  if (!gardenFootprint) return 0;

  let height = 2;
  const orchardMound = falloff(x, z, 13, 45, 8, 7);
  const upperGarden = falloff(x, z, 25, 38, 8, 6);
  if (orchardMound > 0.78 || upperGarden > 0.74) height = 3;
  return height;
}

function getProjectsBaseHeight(x: number, z: number) {
  const projectFootprint = (
    isInsideAuthoredMask(x, z, 17, 20, 18, 14) ||
    isInsideAuthoredMask(x, z, 25, 13, 10, 8) ||
    isInsideAuthoredMask(x, z, 12, 28, 9, 8) ||
    (x >= 8 && x <= 29 && z >= 12 && z <= 30)
  );
  if (!projectFootprint) return 0;

  let height = 3;
  if (x >= 8 && x <= 17 && z >= 11 && z <= 18) height = 4;
  if (x >= 19 && x <= 29 && z >= 12 && z <= 21) height = 4;
  if (x >= 9 && x <= 16 && z >= 22 && z <= 30) height = 4;
  if (x >= 22 && x <= 30 && z >= 7 && z <= 13) height = 5;
  if (falloff(x, z, 25, 12, 8, 5) > 0.68) height = Math.max(height, 5);
  return height;
}

function getAboutBaseHeight(x: number, z: number) {
  const broadYard = isInsideAuthoredMask(x, z, 45, 55, 22, 11);
  const southeastCorner = x >= 38 && x <= 62 && z >= 48 && z <= 62;
  if (!broadYard && !southeastCorner) return 0;

  const housePad = x >= 37 && x <= 49 && z >= 49 && z <= 56;
  if (housePad) return 1;

  let height = 1;
  const gardenRise = falloff(x, z, 56, 52, 8, 6);
  const southBank = falloff(x, z, 47, 61, 12, 4);

  if (gardenRise > 0.72 || southBank > 0.82) height = 2;

  return height;
}

function getContactBaseHeight(x: number, z: number) {
  const contactFootprint = isInsideAuthoredMask(x, z, 30, 59, 10, 5);
  const approachShoulder = nearestPrimaryRoutePoint(x, z, [[31, 36], [29, 44], [30, 52], [30, 59]]);
  if (!contactFootprint && (!approachShoulder || approachShoulder.distance > 2.7)) return 0;

  const postOfficePad = x >= 27 && x <= 34 && z >= 57 && z <= 61;
  const rearHill = falloff(x, z, 30, 59, 7, 4);
  const mailboxShoulder = falloff(x, z, 35, 57, 4, 3);
  if (postOfficePad || rearHill > 0.64 || mailboxShoulder > 0.74) return 2;

  return 1;
}

function carvePrimaryTerrainRoutes(x: number, z: number, height: number) {
  height = carveSteppedRoute(x, z, height, [
    [33, 31, 1],
    [38, 28, 2],
    [43, 27, 3],
    [50, 24, 4],
    [52, 19, 5],
    [44, 17, 4],
    [48, 12, 5],
    [56, 13, 6],
    [59, 8, 7],
  ], 1.35, 2.4);

  height = carveSteppedRoute(x, z, height, [
    [30, 35, 1],
    [25, 38, 2],
    [19, 42, 2],
    [13, 46, 2],
    [9, 50, 2],
  ], 1.8, 3);

  height = carveSteppedRoute(x, z, height, [
    [21, 43, 2],
    [15, 40, 2],
    [21, 37, 2],
    [28, 40, 2],
  ], 1.55, 2.4);

  height = carveSteppedRoute(x, z, height, [
    [24, 36, 2],
    [22, 31, 3],
    [15, 28, 3],
    [10, 24, 4],
    [17, 19, 4],
    [26, 14, 5],
  ], 1.65, 2.7);

  height = carveSteppedRoute(x, z, height, [
    [31, 36, 1],
    [29, 44, 1],
    [30, 52, 1],
    [30, 59, 2],
  ], 1.45, 2.25);

  height = carveSteppedRoute(x, z, height, [
    [34, 38, 1],
    [38, 45, 1],
    [42, 50, 1],
  ], 1.35, 2.2);

  return height;
}

function applyArrivalClearing(x: number, z: number, height: number) {
  if (x >= 31 && x <= 32 && z >= 31 && z <= 32) return 0;
  if (x >= 27 && x <= 36 && z >= 28 && z <= 37) return Math.min(height, 1);
  if (falloff(x, z, 32, 33, 9, 8) > 0) return Math.min(height, 1);
  return height;
}

function carveMainWaterSystem(x: number, z: number, height: number) {
  const stream = nearestPrimaryRoutePoint(x, z, [[13, 43], [19, 45], [25, 45], [31, 49], [40, 52]]);
  if (stream && stream.distance < 1.25) return 0;
  if (stream && stream.distance < 2.35) height = Math.min(height, 1);

  const pond = falloff(x, z, 44, 55, 7, 5);
  if (pond > 0.22) return 0;
  if (pond > 0) height = Math.min(height, 1);

  const outlet = nearestPrimaryRoutePoint(x, z, [[49, 57], [55, 60], [60, 63]]);
  if (outlet && outlet.distance < 1.15) return 0;

  return height;
}

function isInsideAuthoredMask(x: number, z: number, centerX: number, centerZ: number, radiusX: number, radiusZ: number) {
  return falloff(x, z, centerX, centerZ, radiusX, radiusZ) > 0;
}

function carveSteppedRoute(x: number, z: number, height: number, points: Array<[number, number, number]>, pathWidth: number, shoulderWidth: number) {
  const nearest = nearestPrimaryRoutePoint(x, z, points.map((point) => [point[0], point[1]]));
  if (!nearest) return height;

  const start = points[nearest.segmentIndex];
  const end = points[nearest.segmentIndex + 1];
  if (!start || !end) return height;

  const targetHeight = Math.round(start[2] + (end[2] - start[2]) * nearest.t);
  if (nearest.distance < pathWidth) return Math.min(height, targetHeight);
  if (nearest.distance < shoulderWidth) return Math.min(height, targetHeight + 1);
  return height;
}

function falloff(x: number, z: number, centerX: number, centerZ: number, radiusX: number, radiusZ: number) {
  return Math.max(0, 1 - Math.hypot((x - centerX) / radiusX, (z - centerZ) / radiusZ));
}

function nearestPrimaryRoutePoint(x: number, z: number, points: Array<[number, number]>) {
  let nearest: { distance: number; segmentIndex: number; t: number } | null = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;
    const candidate = distanceToPrimaryRouteSegment(x, z, start, end);
    if (!nearest || candidate.distance < nearest.distance) {
      nearest = { ...candidate, segmentIndex: index };
    }
  }
  return nearest;
}

function distanceToPrimaryRouteSegment(x: number, z: number, start: [number, number], end: [number, number]) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return { distance: Math.hypot(x - start[0], z - start[1]), t: 0 };
  const t = Math.max(0, Math.min(1, ((x - start[0]) * dx + (z - start[1]) * dz) / lengthSquared));
  return { distance: Math.hypot(x - (start[0] + dx * t), z - (start[1] + dz * t)), t };
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

const PORTFOLIO_ZONE_PLANS: PortfolioZonePlan[] = [
  {
    id: "projects",
    numericId: 1,
    label: "Projects",
    shortLabel: "Work",
    color: "#b8794a",
    description: "Northwest creative worksite for project showcases and case-study anchors.",
    center: { x: 14, z: 15 },
    radiusX: 9,
    radiusZ: 8,
    elevation: 1,
    blockId: BLOCK_IDS.Special,
    markerId: "project-featured",
  },
  {
    id: "experience",
    numericId: 2,
    label: "Experience",
    shortLabel: "XP",
    color: "#5d7fa6",
    description: "Northern timeline path with milestone anchors and a current-role endpoint.",
    center: { x: 43, z: 12 },
    radiusX: 10,
    radiusZ: 8,
    elevation: 2,
    blockId: BLOCK_IDS.ZoneGround,
    markerId: "experience-start",
  },
  {
    id: "about",
    numericId: 3,
    label: "About",
    shortLabel: "About",
    color: "#b48663",
    description: "Eastern personal studio terrace with profile and CV anchors.",
    center: { x: 49, z: 35 },
    radiusX: 9,
    radiusZ: 8,
    elevation: 1,
    blockId: BLOCK_IDS.Special,
    markerId: "about-introduction",
  },
  {
    id: "skills",
    numericId: 4,
    label: "Skills",
    shortLabel: "Skills",
    color: "#5f8f63",
    description: "Southwest skill garden with grouped technology placeholders.",
    center: { x: 14, z: 44 },
    radiusX: 10,
    radiusZ: 8,
    elevation: 1,
    blockId: BLOCK_IDS.Boundary,
    markerId: "skills-overview",
  },
  {
    id: "contact",
    numericId: 5,
    label: "Contact",
    shortLabel: "Contact",
    color: "#b59a55",
    description: "Southern communication kiosk and contact anchor area.",
    center: { x: 32, z: 53 },
    radiusX: 9,
    radiusZ: 6,
    elevation: 0,
    blockId: BLOCK_IDS.ZoneGround,
    markerId: "contact-main",
  },
];

const PORTFOLIO_V2_ZONE_PLANS: PortfolioZonePlan[] = [
  { id: "projects", numericId: 1, label: "Projects", shortLabel: "Work", color: "#9b7455", description: "Northwest elevated workshop worksite and exhibition yard.", center: { x: 14, z: 18 }, radiusX: 13, radiusZ: 11, elevation: 2, blockId: BLOCK_IDS.Special, markerId: "v2-project-featured" },
  { id: "experience", numericId: 2, label: "Experience", shortLabel: "XP", color: "#657f8f", description: "Northeast ridge route with rising milestone stations.", center: { x: 48, z: 15 }, radiusX: 12, radiusZ: 8, elevation: 2, blockId: BLOCK_IDS.ZoneGround, markerId: "v2-experience-start" },
  { id: "about", numericId: 3, label: "About", shortLabel: "About", color: "#9d8265", description: "Southeast sheltered studio terrace beside trees and rocks.", center: { x: 48, z: 42 }, radiusX: 8, radiusZ: 8, elevation: 1, blockId: BLOCK_IDS.Special, markerId: "v2-about-profile" },
  { id: "skills", numericId: 4, label: "Skills", shortLabel: "Skills", color: "#5e7f5f", description: "Western meandering technology garden.", center: { x: 13, z: 43 }, radiusX: 12, radiusZ: 13, elevation: 1, blockId: BLOCK_IDS.Boundary, markerId: "v2-skills-tree" },
  { id: "contact", numericId: 5, label: "Contact", shortLabel: "Contact", color: "#9c8b58", description: "South-central communication station beside the main road.", center: { x: 34, z: 54 }, radiusX: 9, radiusZ: 7, elevation: 0, blockId: BLOCK_IDS.ZoneGround, markerId: "v2-contact-main" },
];

function createPortfolioV2World() {
  const world = new VoxelWorld();

  for (let z = 1; z <= 62; z += 1) {
    for (let x = 1; x <= 62; x += 1) {
      const nx = (x - 30.5) / 31;
      const nz = (z - 33) / 30;
      const island = nx * nx * 0.88 + nz * nz * 1.05
        + Math.sin((x + z) * 0.12) * 0.035
        + Math.cos((x - z) * 0.09) * 0.03;
      if (island > 0.96) continue;

      const ridge = Math.max(0, 1.15 - distanceToSegment(x, z, 39, 24, 55, 8) / 9);
      const westRise = Math.max(0, 1 - distanceSq(x, z, 12, 38) / 420);
      const projectsRise = Math.max(0, 1 - distanceSq(x, z, 15, 18) / 260);
      const aboutTerrace = Math.max(0, 1 - distanceSq(x, z, 49, 42) / 170);
      const lowValley = distanceToSegment(x, z, 26, 50, 42, 58) < 3.2 ? -1 : 0;
      const rawHeight = projectsRise * 1.9 + ridge * 2.4 + westRise * 1.2 + aboutTerrace * 1.15 + lowValley;
      const topY = Math.max(0, Math.min(4, Math.round(rawHeight)));
      const edge = island > 0.86;
      const blockId = edge || topY >= 3 ? BLOCK_IDS.Boundary : topY >= 1 ? BLOCK_IDS.Ground : BLOCK_IDS.Ground;
      const zoneId = getPortfolioV2ZoneId(x, z);
      for (let y = 0; y <= topY; y += 1) {
        world.setBlock(x, y, z, y === topY ? blockId : BLOCK_IDS.Ground);
        if (zoneId > 0) world.setZone(x, y, z, zoneId);
      }
    }
  }

  const mainPaths: GridXZ[][] = [
    [{ x: 29, z: 32 }, { x: 25, z: 28 }, { x: 20, z: 23 }, { x: 14, z: 18 }, { x: 9, z: 16 }],
    [{ x: 31, z: 30 }, { x: 36, z: 25 }, { x: 42, z: 20 }, { x: 49, z: 14 }, { x: 55, z: 9 }],
    [{ x: 31, z: 35 }, { x: 33, z: 43 }, { x: 35, z: 50 }, { x: 34, z: 56 }],
  ];
  const secondaryPaths: GridXZ[][] = [
    [{ x: 34, z: 36 }, { x: 40, z: 39 }, { x: 48, z: 42 }],
    [{ x: 26, z: 35 }, { x: 20, z: 39 }, { x: 15, z: 45 }, { x: 10, z: 51 }],
    [{ x: 16, z: 24 }, { x: 23, z: 22 }, { x: 34, z: 23 }, { x: 42, z: 20 }],
    [{ x: 18, z: 45 }, { x: 25, z: 51 }, { x: 34, z: 56 }],
    [{ x: 48, z: 42 }, { x: 43, z: 50 }, { x: 34, z: 56 }],
  ];
  fillEllipse(world, { x: 30, z: 32 }, 5, 4, 0, BLOCK_IDS.Path, 0);
  fillEllipse(world, { x: 33, z: 34 }, 3, 2, 0, BLOCK_IDS.Path, 0);
  for (const path of mainPaths) drawPath(world, path, 2);
  for (const path of secondaryPaths) drawPath(world, path, 1);
  addPortfolioV2Foundations(world);
  for (const path of mainPaths) drawPath(world, path, 2);
  for (const path of secondaryPaths) drawPath(world, path, 1);
  addPortfolioV2Foundations(world);
  preserveCenterPlaza(world);
  world.clearDirtyChunks();
  return world;
}

function addPortfolioV2Foundations(world: VoxelWorld) {
  for (const foundation of [
    { x: -17.5, z: -14, width: 16, depth: 13, y: 2, block: BLOCK_IDS.Special, zone: 1 },
    { x: -24, z: -7, width: 5, depth: 5, y: 1, block: BLOCK_IDS.Special, zone: 1 },
    { x: -11, z: -6, width: 5, depth: 4, y: 1, block: BLOCK_IDS.Special, zone: 1 },
    { x: -16, z: -23, width: 8, depth: 5, y: 1, block: BLOCK_IDS.Special, zone: 1 },
    { x: 8, z: -18, width: 5, depth: 4, y: 1, block: BLOCK_IDS.ZoneGround, zone: 2 },
    { x: 13, z: -22, width: 4, depth: 4, y: 2, block: BLOCK_IDS.ZoneGround, zone: 2 },
    { x: 18, z: -24, width: 4, depth: 4, y: 3, block: BLOCK_IDS.ZoneGround, zone: 2 },
    { x: 22, z: -19, width: 6, depth: 5, y: 3, block: BLOCK_IDS.ZoneGround, zone: 2 },
    { x: 23.5, z: -15.5, width: 6, depth: 5, y: 3, block: BLOCK_IDS.ZoneGround, zone: 2 },
    { x: 17, z: 10.5, width: 8, depth: 6, y: 1, block: BLOCK_IDS.Special, zone: 3 },
    { x: -18, z: 12, width: 6, depth: 6, y: 1, block: BLOCK_IDS.Boundary, zone: 4 },
    { x: -26, z: 9, width: 5, depth: 4, y: 1, block: BLOCK_IDS.Boundary, zone: 4 },
    { x: -13, z: 18, width: 5, depth: 4, y: 1, block: BLOCK_IDS.Boundary, zone: 4 },
    { x: 2.5, z: 23, width: 7, depth: 6, y: 0, block: BLOCK_IDS.ZoneGround, zone: 5 },
    { x: 8.5, z: 24.5, width: 5, depth: 5, y: 0, block: BLOCK_IDS.ZoneGround, zone: 5 },
  ]) {
    addFoundation(world, foundation.x, foundation.z, foundation.width, foundation.depth, foundation.y, foundation.block, foundation.zone);
  }
}

function getPortfolioV2ZoneId(x: number, z: number) {
  const zone = PORTFOLIO_V2_ZONE_PLANS.find((candidate) => inEllipse(x, z, candidate.center, candidate.radiusX, candidate.radiusZ));
  return zone?.numericId ?? 0;
}

function createPortfolioMainGreyboxWorld() {
  const world = new VoxelWorld();

  for (let z = 1; z <= 62; z += 1) {
    for (let x = 1; x <= 62; x += 1) {
      const nx = (x - 31.5) / 31;
      const nz = (z - 31.5) / 31;
      const contour = nx * nx * 0.92 + nz * nz * 1.02;
      const carvedEdge = 0.93
        + Math.sin(x * 0.31) * 0.025
        + Math.cos(z * 0.27) * 0.02
        + Math.sin((x - z) * 0.17) * 0.018;
      if (contour < carvedEdge) {
        world.setBlock(x, 0, z, contour > carvedEdge - 0.07 ? BLOCK_IDS.Boundary : BLOCK_IDS.Ground);
      }
    }
  }

  fillEllipse(world, { x: 31, z: 31 }, 6, 6, 0, BLOCK_IDS.Path, 0);
  fillEllipse(world, { x: 32, z: 32 }, 6, 6, 0, BLOCK_IDS.Path, 0);

  fillEllipse(world, { x: 14, z: 15 }, 11, 9, 1, BLOCK_IDS.Special, 1);
  fillEllipse(world, { x: 43, z: 13 }, 12, 9, 1, BLOCK_IDS.ZoneGround, 2);
  fillEllipse(world, { x: 49, z: 35 }, 10, 9, 1, BLOCK_IDS.Special, 3);
  fillEllipse(world, { x: 14, z: 44 }, 11, 9, 1, BLOCK_IDS.Boundary, 4);
  fillEllipse(world, { x: 32, z: 53 }, 10, 7, 0, BLOCK_IDS.ZoneGround, 5);

  const paths: GridXZ[][] = [
    [{ x: 31, z: 31 }, { x: 27, z: 27 }, { x: 22, z: 23 }, { x: 17, z: 18 }, { x: 14, z: 15 }],
    [{ x: 32, z: 31 }, { x: 36, z: 26 }, { x: 40, z: 20 }, { x: 43, z: 12 }],
    [{ x: 33, z: 32 }, { x: 39, z: 33 }, { x: 45, z: 34 }, { x: 49, z: 35 }],
    [{ x: 32, z: 34 }, { x: 32, z: 40 }, { x: 32, z: 47 }, { x: 32, z: 53 }],
    [{ x: 30, z: 33 }, { x: 25, z: 36 }, { x: 20, z: 40 }, { x: 14, z: 44 }],
    [{ x: 14, z: 15 }, { x: 25, z: 12 }, { x: 36, z: 10 }, { x: 43, z: 12 }],
    [{ x: 14, z: 44 }, { x: 23, z: 50 }, { x: 32, z: 53 }],
    [{ x: 49, z: 35 }, { x: 43, z: 44 }, { x: 32, z: 53 }],
  ];
  for (const path of paths) {
    drawPath(world, path, 2);
  }

  const internalPaths: GridXZ[][] = [
    [{ x: 10, z: 18 }, { x: 14, z: 15 }, { x: 18, z: 12 }, { x: 20, z: 20 }, { x: 12, z: 22 }],
    [{ x: 38, z: 18 }, { x: 41, z: 15 }, { x: 44, z: 12 }, { x: 47, z: 10 }, { x: 51, z: 10 }],
    [{ x: 46, z: 17 }, { x: 42, z: 18 }, { x: 41, z: 13 }],
    [{ x: 48, z: 32 }, { x: 53, z: 33 }, { x: 54, z: 38 }, { x: 47, z: 39 }, { x: 48, z: 32 }],
    [{ x: 10, z: 41 }, { x: 17, z: 40 }, { x: 19, z: 47 }, { x: 14, z: 52 }, { x: 10, z: 41 }],
    [{ x: 27, z: 51 }, { x: 32, z: 53 }, { x: 37, z: 51 }, { x: 35, z: 57 }, { x: 29, z: 57 }, { x: 27, z: 51 }],
  ];
  for (const path of internalPaths) {
    drawPath(world, path, 1);
  }

  addPhase5SemanticTerrain(world);
  for (const path of paths) {
    drawPath(world, path, 2);
  }
  for (const path of internalPaths) {
    drawPath(world, path, 1);
  }
  addPhase5PrefabFoundations(world);
  preserveCenterPlaza(world);
  world.clearDirtyChunks();
  return world;
}

function addPhase5SemanticTerrain(world: VoxelWorld) {
  for (const foundation of [
    { x: 0, z: 0, width: 12, depth: 12, y: 0, block: BLOCK_IDS.Path, zone: 0 },
    { x: -17.5, z: -16.5, width: 9, depth: 7, y: 1, block: BLOCK_IDS.Special, zone: 1 },
    { x: -23, z: -10.5, width: 5, depth: 5, y: 1, block: BLOCK_IDS.Special, zone: 1 },
    { x: -10, z: -11, width: 5, depth: 5, y: 1, block: BLOCK_IDS.Special, zone: 1 },
    { x: -16.5, z: -24, width: 7, depth: 4, y: 1, block: BLOCK_IDS.Special, zone: 1 },
    { x: 7, z: -13.5, width: 5, depth: 4, y: 1, block: BLOCK_IDS.ZoneGround, zone: 2 },
    { x: 12, z: -18, width: 5, depth: 4, y: 2, block: BLOCK_IDS.ZoneGround, zone: 2 },
    { x: 18.5, z: -21, width: 8, depth: 5, y: 2, block: BLOCK_IDS.ZoneGround, zone: 2 },
    { x: 17.5, z: 3.5, width: 8, depth: 6, y: 1, block: BLOCK_IDS.Special, zone: 3 },
    { x: 22.5, z: 9, width: 6, depth: 4, y: 1, block: BLOCK_IDS.Special, zone: 3 },
    { x: 14, z: 7.5, width: 5, depth: 4, y: 1, block: BLOCK_IDS.Special, zone: 3 },
    { x: -17.5, z: 12.5, width: 7, depth: 7, y: 1, block: BLOCK_IDS.Boundary, zone: 4 },
    { x: -24, z: 9, width: 6, depth: 5, y: 1, block: BLOCK_IDS.Boundary, zone: 4 },
    { x: -12, z: 9, width: 6, depth: 5, y: 1, block: BLOCK_IDS.Boundary, zone: 4 },
    { x: -23, z: 18, width: 6, depth: 5, y: 1, block: BLOCK_IDS.Boundary, zone: 4 },
    { x: -10, z: 18, width: 6, depth: 5, y: 1, block: BLOCK_IDS.Boundary, zone: 4 },
    { x: -17.5, z: 21.5, width: 6, depth: 5, y: 1, block: BLOCK_IDS.Boundary, zone: 4 },
    { x: 0.5, z: 21.5, width: 7, depth: 6, y: 0, block: BLOCK_IDS.ZoneGround, zone: 5 },
    { x: -6.5, z: 23.5, width: 5, depth: 5, y: 0, block: BLOCK_IDS.ZoneGround, zone: 5 },
    { x: 6.5, z: 24, width: 5, depth: 5, y: 0, block: BLOCK_IDS.ZoneGround, zone: 5 },
  ]) {
    addFoundation(world, foundation.x, foundation.z, foundation.width, foundation.depth, foundation.y, foundation.block, foundation.zone);
  }

  for (const ring of [
    { center: { x: 14, z: 15 }, rx: 11, rz: 9, y: 1 },
    { center: { x: 43, z: 13 }, rx: 12, rz: 9, y: 1 },
    { center: { x: 49, z: 35 }, rx: 10, rz: 9, y: 1 },
    { center: { x: 14, z: 44 }, rx: 11, rz: 9, y: 1 },
    { center: { x: 32, z: 53 }, rx: 10, rz: 7, y: 0 },
  ]) {
    addRetainingRing(world, ring.center, ring.rx + 1, ring.rz + 1, ring.y);
  }
}

function addPhase5PrefabFoundations(world: VoxelWorld) {
  for (const foundation of [
    { x: -17.5, z: -16.5, width: 9, depth: 7, y: 1, block: BLOCK_IDS.Special, zone: 1 },
    { x: -23, z: -10.5, width: 5, depth: 5, y: 1, block: BLOCK_IDS.Special, zone: 1 },
    { x: -10, z: -11, width: 5, depth: 5, y: 1, block: BLOCK_IDS.Special, zone: 1 },
    { x: -16.5, z: -24, width: 7, depth: 4, y: 1, block: BLOCK_IDS.Special, zone: 1 },
    { x: 5.5, z: -10.5, width: 5, depth: 4, y: 1, block: BLOCK_IDS.ZoneGround, zone: 2 },
    { x: 7, z: -13.5, width: 5, depth: 4, y: 1, block: BLOCK_IDS.ZoneGround, zone: 2 },
    { x: 12, z: -18, width: 5, depth: 4, y: 2, block: BLOCK_IDS.ZoneGround, zone: 2 },
    { x: 18.5, z: -21, width: 8, depth: 5, y: 2, block: BLOCK_IDS.ZoneGround, zone: 2 },
    { x: 17.5, z: 3.5, width: 8, depth: 6, y: 1, block: BLOCK_IDS.Special, zone: 3 },
    { x: 22.5, z: 9, width: 6, depth: 4, y: 1, block: BLOCK_IDS.Special, zone: 3 },
    { x: 14, z: 7.5, width: 5, depth: 4, y: 1, block: BLOCK_IDS.Special, zone: 3 },
    { x: -17.5, z: 12.5, width: 7, depth: 7, y: 1, block: BLOCK_IDS.Boundary, zone: 4 },
    { x: -24, z: 9, width: 5, depth: 4, y: 1, block: BLOCK_IDS.Boundary, zone: 4 },
    { x: -12, z: 9, width: 5, depth: 4, y: 1, block: BLOCK_IDS.Boundary, zone: 4 },
    { x: -23, z: 18, width: 5, depth: 4, y: 1, block: BLOCK_IDS.Boundary, zone: 4 },
    { x: -10, z: 18, width: 5, depth: 4, y: 1, block: BLOCK_IDS.Boundary, zone: 4 },
    { x: 0.5, z: 21.5, width: 7, depth: 6, y: 0, block: BLOCK_IDS.ZoneGround, zone: 5 },
    { x: -6.5, z: 23.5, width: 5, depth: 5, y: 0, block: BLOCK_IDS.ZoneGround, zone: 5 },
    { x: 6.5, z: 24, width: 5, depth: 5, y: 0, block: BLOCK_IDS.ZoneGround, zone: 5 },
  ]) {
    addFoundation(world, foundation.x, foundation.z, foundation.width, foundation.depth, foundation.y, foundation.block, foundation.zone);
  }
}

function createPortfolioMainBasicBackupWorld() {
  const world = new VoxelWorld();

  for (let z = 2; z <= 61; z += 1) {
    for (let x = 2; x <= 61; x += 1) {
      const nx = (x - 31.5) / 31;
      const nz = (z - 31.5) / 31;
      const edgeNoise = Math.sin(x * 0.47) * 1.2 + Math.cos(z * 0.39) * 1.1;
      const island = nx * nx * 0.94 + nz * nz * 1.04 < 0.88 + edgeNoise * 0.012;
      if (island) {
        world.setBlock(x, 0, z, BLOCK_IDS.Ground);
      }
    }
  }

  for (const zone of PORTFOLIO_ZONE_PLANS) {
    fillEllipse(world, zone.center, zone.radiusX, zone.radiusZ, zone.elevation, zone.blockId, zone.numericId);
  }

  fillEllipse(world, { x: 31, z: 31 }, 7, 7, 0, BLOCK_IDS.Path, 0);
  fillEllipse(world, { x: 32, z: 32 }, 7, 7, 0, BLOCK_IDS.Path, 0);
  for (const path of [
    [{ x: 31, z: 31 }, { x: 27, z: 27 }, { x: 22, z: 23 }, { x: 17, z: 18 }, { x: 14, z: 15 }],
    [{ x: 32, z: 31 }, { x: 36, z: 26 }, { x: 40, z: 20 }, { x: 43, z: 12 }],
    [{ x: 33, z: 32 }, { x: 39, z: 33 }, { x: 45, z: 34 }, { x: 49, z: 35 }],
    [{ x: 32, z: 34 }, { x: 32, z: 40 }, { x: 32, z: 47 }, { x: 32, z: 53 }],
    [{ x: 30, z: 33 }, { x: 25, z: 36 }, { x: 20, z: 40 }, { x: 14, z: 44 }],
    [{ x: 14, z: 15 }, { x: 25, z: 12 }, { x: 36, z: 10 }, { x: 43, z: 12 }],
    [{ x: 14, z: 44 }, { x: 23, z: 50 }, { x: 32, z: 53 }],
    [{ x: 49, z: 35 }, { x: 43, z: 44 }, { x: 32, z: 53 }],
  ]) {
    drawPath(world, path, 2);
  }

  addExperienceRise(world);
  addPortfolioStructureFoundations(world);
  addPhase5PrefabFoundations(world);
  addLowBoundaries(world);
  preserveCenterPlaza(world);
  world.clearDirtyChunks();
  return world;
}

function getPortfolioTerrainHeight(x: number, z: number) {
  let height = 0;
  const ridge = Math.sin((x - 8) * 0.19) + Math.cos((z + 4) * 0.17);
  if (ridge > 1.18 && z < 48) height += 1;
  if (distanceSq(x, z, 44, 12) < 13 * 13) height = Math.max(height, 1);
  if (distanceSq(x, z, 48, 10) < 8 * 8) height = Math.max(height, 2);
  if (distanceSq(x, z, 17, 16) < 10 * 10) height = Math.max(height, 1);
  if (distanceSq(x, z, 49, 36) < 9 * 9) height = Math.max(height, 1);
  if (distanceSq(x, z, 14, 44) < 10 * 10) height = Math.max(height, 1);
  if (distanceSq(x, z, 53, 24) < 5 * 5 || distanceSq(x, z, 8, 32) < 6 * 6) height = Math.max(0, height - 1);
  if (distanceSq(x, z, 50, 9) < 5 * 5) height = 3;
  return Math.min(height, 3);
}

function getPortfolioTerrainBlock(x: number, z: number): BlockId {
  const zone = PORTFOLIO_ZONE_PLANS.find((candidate) => inEllipse(x, z, candidate.center, candidate.radiusX + 2, candidate.radiusZ + 2));
  return zone?.blockId ?? BLOCK_IDS.Ground;
}

function getPortfolioZoneId(x: number, z: number) {
  const zone = PORTFOLIO_ZONE_PLANS.find((candidate) => inEllipse(x, z, candidate.center, candidate.radiusX + 1, candidate.radiusZ + 1));
  return zone?.numericId ?? 0;
}

function addRichTerrainAccents(world: VoxelWorld) {
  for (const terrace of [
    { center: { x: 16, z: 15 }, rx: 7, rz: 5, y: 2, block: BLOCK_IDS.Special, zone: 1 },
    { center: { x: 45, z: 13 }, rx: 5, rz: 4, y: 3, block: BLOCK_IDS.ZoneGround, zone: 2 },
    { center: { x: 50, z: 37 }, rx: 5, rz: 4, y: 2, block: BLOCK_IDS.Special, zone: 3 },
    { center: { x: 14, z: 44 }, rx: 7, rz: 5, y: 2, block: BLOCK_IDS.Boundary, zone: 4 },
    { center: { x: 32, z: 55 }, rx: 5, rz: 3, y: 1, block: BLOCK_IDS.ZoneGround, zone: 5 },
  ]) {
    fillEllipse(world, terrace.center, terrace.rx, terrace.rz, terrace.y, terrace.block, terrace.zone);
    addRetainingRing(world, terrace.center, terrace.rx + 1, terrace.rz + 1, Math.max(1, terrace.y - 1));
  }

  for (const depression of [
    { center: { x: 53, z: 24 }, rx: 4, rz: 3 },
    { center: { x: 8, z: 32 }, rx: 5, rz: 4 },
  ]) {
    fillEllipse(world, depression.center, depression.rx, depression.rz, 0, BLOCK_IDS.Ground, 0);
    addRetainingRing(world, depression.center, depression.rx + 1, depression.rz + 1, 0);
  }

  for (const node of [{ x: 25, z: 26 }, { x: 37, z: 26 }, { x: 39, z: 44 }, { x: 24, z: 49 }]) {
    fillEllipse(world, node, 3, 2, Math.max(0, getTopY(world, node.x, node.z)), BLOCK_IDS.Path, 0);
  }
}

function addPortfolioStructureFoundations(world: VoxelWorld) {
  for (const foundation of [
    { x: -17.5, z: -16.5, width: 5, depth: 5, y: 2, block: BLOCK_IDS.Special, zone: 1 },
    { x: -21, z: -10, width: 5, depth: 5, y: 1, block: BLOCK_IDS.Special, zone: 1 },
    { x: -25, z: -12, width: 4, depth: 4, y: 1, block: BLOCK_IDS.Special, zone: 1 },
    { x: -9, z: -10, width: 4, depth: 4, y: 1, block: BLOCK_IDS.Special, zone: 1 },
    { x: -11, z: -19, width: 5, depth: 5, y: 1, block: BLOCK_IDS.Special, zone: 1 },
    { x: 5.5, z: -10.5, width: 5, depth: 4, y: 1, block: BLOCK_IDS.ZoneGround, zone: 2 },
    { x: 17.5, z: 3.5, width: 5, depth: 5, y: 2, block: BLOCK_IDS.Special, zone: 3 },
    { x: 24, z: 9, width: 4, depth: 4, y: 1, block: BLOCK_IDS.Special, zone: 3 },
    { x: -8, z: 22.5, width: 4, depth: 4, y: 1, block: BLOCK_IDS.Boundary, zone: 4 },
    { x: 0.5, z: 21.5, width: 4, depth: 4, y: 1, block: BLOCK_IDS.ZoneGround, zone: 5 },
    { x: 0, z: 26, width: 4, depth: 4, y: 1, block: BLOCK_IDS.ZoneGround, zone: 5 },
    { x: -6, z: 22, width: 4, depth: 4, y: 1, block: BLOCK_IDS.ZoneGround, zone: 5 },
  ]) {
    addFoundation(world, foundation.x, foundation.z, foundation.width, foundation.depth, foundation.y, foundation.block, foundation.zone);
  }
}

function addFoundation(world: VoxelWorld, worldX: number, worldZ: number, width: number, depth: number, topY: number, blockId: BlockId, zoneId: number) {
  const centerX = Math.round(worldX + 31.5);
  const centerZ = Math.round(worldZ + 31.5);
  const minX = Math.max(0, Math.floor(centerX - width / 2));
  const maxX = Math.min(WORLD_CONFIG.width - 1, Math.ceil(centerX + width / 2));
  const minZ = Math.max(0, Math.floor(centerZ - depth / 2));
  const maxZ = Math.min(WORLD_CONFIG.depth - 1, Math.ceil(centerZ + depth / 2));
  for (let z = minZ; z <= maxZ; z += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = 0; y < WORLD_CONFIG.height; y += 1) {
        if (y <= topY) {
          world.setBlock(x, y, z, y === topY ? blockId : BLOCK_IDS.Ground);
          world.setZone(x, y, z, zoneId);
        } else if (y <= topY + 2) {
          world.setBlock(x, y, z, BLOCK_IDS.Air);
          world.setZone(x, y, z, 0);
        }
      }
    }
  }
}

function addRetainingRing(world: VoxelWorld, center: GridXZ, radiusX: number, radiusZ: number, y: number) {
  for (let z = Math.max(0, center.z - radiusZ); z <= Math.min(WORLD_CONFIG.depth - 1, center.z + radiusZ); z += 1) {
    for (let x = Math.max(0, center.x - radiusX); x <= Math.min(WORLD_CONFIG.width - 1, center.x + radiusX); x += 1) {
      const outer = inEllipse(x, z, center, radiusX, radiusZ);
      const inner = inEllipse(x, z, center, Math.max(1, radiusX - 1), Math.max(1, radiusZ - 1));
      if (outer && !inner && world.getHighestNonAirY(x, z) !== null) {
        world.setBlock(x, y, z, BLOCK_IDS.Boundary);
      }
    }
  }
}

function createPortfolioMainZones(): MapZoneDefinition[] {
  return PORTFOLIO_ZONE_PLANS.map((zone, index) => createZone(zone.id, zone.numericId, zone.label, zone.shortLabel, zone.description, zone.color, index + 1, zone.markerId));
}

function createPortfolioMainMarkers(): MapMarkerDefinition[] {
  return [
    portfolioMarker("arrival-point", "Arrival point", undefined, 31, 1, 31, undefined, "info", "overview"),
    portfolioMarker("map-center", "Map center", undefined, 32, 1, 32, undefined, "info", "overview"),
    portfolioMarker("loader-origin", "Loader origin", undefined, 31, 1, 32, undefined, "info", "overview"),

    portfolioMarker("project-featured", "Featured project", "projects", 14, 2, 15, { contentType: "project", contentId: "project-placeholder-1" }, "project", "projects-focus"),
    portfolioMarker("project-01", "Project 01", "projects", 10, 2, 18, { contentType: "project", contentId: "project-placeholder-1" }, "project", "projects-focus"),
    portfolioMarker("project-02", "Project 02", "projects", 17, 2, 19, { contentType: "project", contentId: "project-placeholder-2" }, "project", "projects-focus"),
    portfolioMarker("project-03", "Project 03", "projects", 9, 2, 12, { contentType: "project", contentId: "project-placeholder-3" }, "project", "projects-focus"),
    portfolioMarker("project-04", "Project 04", "projects", 18, 2, 12, { contentType: "project", contentId: "project-placeholder-2" }, "project", "projects-focus"),
    portfolioMarker("project-more", "More projects", "projects", 14, 2, 21, { contentType: "project", contentId: "project-placeholder-3" }, "secondary", "projects-focus"),

    portfolioMarker("experience-start", "Experience start", "experience", 38, 1, 18, { contentType: "experience", contentId: "experience-placeholder-1" }, "primary", "experience-focus"),
    portfolioMarker("experience-milestone-01", "Experience milestone 01", "experience", 41, 2, 15, { contentType: "experience", contentId: "experience-placeholder-1" }, "secondary", "experience-focus"),
    portfolioMarker("experience-milestone-02", "Experience milestone 02", "experience", 44, 3, 12, { contentType: "experience", contentId: "experience-placeholder-1" }, "secondary", "experience-focus"),
    portfolioMarker("experience-milestone-03", "Experience milestone 03", "experience", 47, 3, 10, { contentType: "experience", contentId: "experience-placeholder-1" }, "secondary", "experience-focus"),
    portfolioMarker("experience-current", "Current experience", "experience", 51, 3, 10, { contentType: "experience", contentId: "experience-placeholder-1" }, "primary", "experience-current-focus"),
    portfolioMarker("experience-education", "Education", "experience", 46, 2, 17, { contentType: "experience", contentId: "experience-placeholder-1" }, "secondary", "experience-focus"),

    portfolioMarker("about-introduction", "About introduction", "about", 49, 2, 35, { contentType: "about", contentId: "about-placeholder" }, "primary", "about-focus"),
    portfolioMarker("about-profile", "Profile", "about", 53, 2, 33, { contentType: "about", contentId: "about-placeholder" }, "info", "about-focus"),
    portfolioMarker("about-values", "Values", "about", 47, 2, 39, { contentType: "about", contentId: "about-placeholder" }, "info", "about-focus"),
    portfolioMarker("about-cv", "CV", "about", 54, 2, 38, { contentType: "about", contentId: "about-placeholder" }, "info", "about-focus"),
    portfolioMarker("about-workspace", "Workspace", "about", 48, 2, 32, { contentType: "about", contentId: "about-placeholder" }, "secondary", "about-focus"),

    portfolioMarker("skills-overview", "Skills overview", "skills", 14, 2, 44, { contentType: "skillGroup", contentId: "frontend" }, "primary", "skills-focus"),
    portfolioMarker("skills-frontend", "Frontend skills", "skills", 10, 2, 41, { contentType: "skillGroup", contentId: "frontend" }, "info", "skills-focus"),
    portfolioMarker("skills-backend", "Backend skills", "skills", 17, 2, 40, { contentType: "skillGroup", contentId: "backend" }, "info", "skills-focus"),
    portfolioMarker("skills-tooling", "Tooling skills", "skills", 19, 2, 47, { contentType: "skillGroup", contentId: "tools" }, "info", "skills-focus"),
    portfolioMarker("skills-design", "Design skills", "skills", 11, 2, 49, { contentType: "skillGroup", contentId: "design" }, "info", "skills-focus"),
    portfolioMarker("skills-other", "Other skills", "skills", 14, 2, 52, { contentType: "skillGroup", contentId: "frontend" }, "secondary", "skills-focus"),

    portfolioMarker("contact-main", "Contact", "contact", 32, 1, 53, { contentType: "contact", contentId: "contact-placeholder" }, "contact", "contact-focus"),
    portfolioMarker("contact-form", "Contact form", "contact", 29, 1, 55, { contentType: "contact", contentId: "contact-placeholder" }, "contact", "contact-focus"),
    portfolioMarker("contact-email", "Email", "contact", 35, 1, 55, { contentType: "contact", contentId: "contact-placeholder" }, "contact", "contact-focus"),
    portfolioMarker("contact-linkedin", "LinkedIn", "contact", 27, 1, 51, { contentType: "contact", contentId: "contact-placeholder" }, "secondary", "contact-focus"),
    portfolioMarker("contact-github", "GitHub", "contact", 37, 1, 51, { contentType: "contact", contentId: "contact-placeholder" }, "secondary", "contact-focus"),
    portfolioMarker("contact-cv", "Contact CV", "contact", 32, 1, 58, { contentType: "contact", contentId: "contact-placeholder" }, "secondary", "contact-focus"),
  ];
}

function createPortfolioV2Zones(): MapZoneDefinition[] {
  return PORTFOLIO_V2_ZONE_PLANS.map((zone, index) => createZone(zone.id, zone.numericId, zone.label, zone.shortLabel, zone.description, zone.color, index + 1, zone.markerId));
}

function createPortfolioV2Markers(): MapMarkerDefinition[] {
  return [
    portfolioMarker("v2-arrival", "Arrival clearing", undefined, 30, 1, 32, undefined, "primary", "overview"),
    portfolioMarker("v2-intro", "Portfolio introduction", undefined, 28, 1, 29, undefined, "info", "overview"),
    portfolioMarker("v2-project-featured", "Featured project", "projects", 14, 3, 18, { contentType: "project", contentId: "project-placeholder-1" }, "project", "v2-projects-focus"),
    portfolioMarker("v2-project-01", "Project 01", "projects", 10, 3, 16, { contentType: "project", contentId: "project-placeholder-1" }, "project", "v2-projects-focus"),
    portfolioMarker("v2-project-02", "Project 02", "projects", 15, 3, 10, { contentType: "project", contentId: "project-placeholder-2" }, "project", "v2-projects-focus"),
    portfolioMarker("v2-project-03", "Project 03", "projects", 22, 2, 24, { contentType: "project", contentId: "project-placeholder-3" }, "project", "v2-projects-focus"),
    portfolioMarker("v2-project-04", "Project 04", "projects", 7, 2, 24, { contentType: "project", contentId: "project-placeholder-2" }, "project", "v2-projects-focus"),
    portfolioMarker("v2-project-05", "Project 05", "projects", 20, 2, 13, { contentType: "project", contentId: "project-placeholder-3" }, "project", "v2-projects-focus"),
    portfolioMarker("v2-experience-start", "Experience start", "experience", 39, 2, 20, { contentType: "experience", contentId: "experience-placeholder-1" }, "primary", "v2-experience-focus"),
    portfolioMarker("v2-experience-01", "Milestone 01", "experience", 43, 2, 17, { contentType: "experience", contentId: "experience-placeholder-1" }, "secondary", "v2-experience-focus"),
    portfolioMarker("v2-experience-02", "Milestone 02", "experience", 46, 3, 13, { contentType: "experience", contentId: "experience-placeholder-1" }, "secondary", "v2-experience-focus"),
    portfolioMarker("v2-experience-03", "Milestone 03", "experience", 50, 4, 10, { contentType: "experience", contentId: "experience-placeholder-1" }, "secondary", "v2-experience-focus"),
    portfolioMarker("v2-experience-current", "Current role lookout", "experience", 53, 4, 12, { contentType: "experience", contentId: "experience-placeholder-1" }, "primary", "v2-experience-focus"),
    portfolioMarker("v2-experience-education", "Education branch", "experience", 47, 2, 19, { contentType: "experience", contentId: "experience-placeholder-1" }, "secondary", "v2-experience-focus"),
    portfolioMarker("v2-about-profile", "Profile", "about", 49, 2, 42, { contentType: "about", contentId: "about-placeholder" }, "primary", "v2-about-focus"),
    portfolioMarker("v2-about-workspace", "Workspace", "about", 47, 2, 39, { contentType: "about", contentId: "about-placeholder" }, "secondary", "v2-about-focus"),
    portfolioMarker("v2-about-cv", "CV", "about", 53, 2, 44, { contentType: "about", contentId: "about-placeholder" }, "info", "v2-about-focus"),
    portfolioMarker("v2-about-values", "Values", "about", 45, 2, 45, { contentType: "about", contentId: "about-placeholder" }, "info", "v2-about-focus"),
    portfolioMarker("v2-skills-tree", "Skills overview", "skills", 14, 2, 43, { contentType: "skillGroup", contentId: "frontend" }, "primary", "v2-skills-focus"),
    portfolioMarker("v2-skills-frontend", "Frontend", "skills", 7, 2, 39, { contentType: "skillGroup", contentId: "frontend" }, "info", "v2-skills-focus"),
    portfolioMarker("v2-skills-backend", "Backend", "skills", 15, 2, 52, { contentType: "skillGroup", contentId: "backend" }, "info", "v2-skills-focus"),
    portfolioMarker("v2-skills-tooling", "Tooling", "skills", 20, 2, 39, { contentType: "skillGroup", contentId: "tools" }, "info", "v2-skills-focus"),
    portfolioMarker("v2-skills-design", "Design UX", "skills", 8, 2, 50, { contentType: "skillGroup", contentId: "design" }, "info", "v2-skills-focus"),
    portfolioMarker("v2-contact-main", "Contact station", "contact", 34, 1, 54, { contentType: "contact", contentId: "contact-placeholder" }, "contact", "v2-contact-focus"),
    portfolioMarker("v2-contact-form", "Contact form", "contact", 29, 1, 55, { contentType: "contact", contentId: "contact-placeholder" }, "contact", "v2-contact-focus"),
    portfolioMarker("v2-contact-email", "Email", "contact", 38, 1, 55, { contentType: "contact", contentId: "contact-placeholder" }, "contact", "v2-contact-focus"),
    portfolioMarker("v2-contact-github", "GitHub", "contact", 31, 1, 51, { contentType: "contact", contentId: "contact-placeholder" }, "secondary", "v2-contact-focus"),
    portfolioMarker("v2-contact-linkedin", "LinkedIn", "contact", 36, 1, 50, { contentType: "contact", contentId: "contact-placeholder" }, "secondary", "v2-contact-focus"),
    portfolioMarker("v2-contact-cv", "CV download", "contact", 33, 1, 59, { contentType: "contact", contentId: "contact-placeholder" }, "secondary", "v2-contact-focus"),
  ];
}

function createPortfolioV2Entities(world: VoxelWorld): PlacedMapEntity[] {
  const entities: PlacedMapEntity[] = [];
  const place = (input: PortfolioPrefabPlacement) => {
    const entity = createPortfolioPrefabEntity(input, world);
    if (entity) entities.push(entity);
  };
  const v2 = (suffix: string) => `portfolio-v2-${suffix}`;

  place({ id: "v2-arrival-monument", name: "Arrival orientation monument", prefabId: v2("orientation-monument"), variantId: "tall", markerId: "v2-arrival", x: -1.5, z: 0.5, rotationY: Math.PI / 8, tags: ["portfolio-v2", "arrival", "static", "landmark"] });
  place({ id: "v2-arrival-surround", name: "Loader origin surround", prefabId: v2("loader-origin-surround"), markerId: "v2-arrival", x: 0, z: 0, rotationY: 0, tags: ["portfolio-v2", "arrival", "static"] });
  place({ id: "v2-arrival-intro-board", name: "Portfolio intro board", prefabId: v2("intro-board"), variantId: "wide", markerId: "v2-intro", x: -3.5, z: -3.5, rotationY: -Math.PI / 5, tags: ["portfolio-v2", "arrival", "interactive-stationary"] });
  addV2Cluster(place, "arrival-signs", v2("direction-sign"), undefined, undefined, [[-5, -2.5], [2.5, -4.5], [4.5, 2], [-3, 4.2], [1, 5.2]], ["portfolio-v2", "arrival", "static", "signage"]);
  addV2Cluster(place, "arrival-seating", v2("plaza-seating"), "medium", undefined, [[-5.5, 1.5], [3.5, 4], [4.8, -1.5]], ["portfolio-v2", "arrival", "static", "seating"]);
  addV2Cluster(place, "arrival-planters", v2("plaza-planter"), "small", undefined, [[-6, -4.5], [4, -5.5], [-4.5, 4.8], [5.8, 1.2]], ["portfolio-v2", "arrival", "static", "vegetation"]);
  addV2Cluster(place, "arrival-clearing-stones", v2("stepping-stone"), "small", undefined, [[-2, -5], [1.5, -5.5], [5, -0.5], [2.5, 5], [-4.5, 2.5], [-5.5, -1.5]], ["portfolio-v2", "arrival", "static", "infrastructure"]);

  place({ id: "v2-projects-workshop", name: "Developer workshop", prefabId: v2("developer-workshop"), variantId: "standard", zoneId: "projects", markerId: "v2-project-featured", x: -17.5, z: -14, rotationY: -Math.PI / 12, tags: ["portfolio-v2", "projects", "static", "landmark", "structure"] });
  place({ id: "v2-projects-annex", name: "Workshop annex", prefabId: v2("workshop-annex"), variantId: "medium", zoneId: "projects", x: -24, z: -7, rotationY: Math.PI / 2, tags: ["portfolio-v2", "projects", "static", "structure"] });
  place({ id: "v2-projects-yard", name: "Covered outdoor workspace", prefabId: v2("covered-workspace"), variantId: "medium", zoneId: "projects", x: -11, z: -6, rotationY: -Math.PI / 2, tags: ["portfolio-v2", "projects", "static", "structure"] });
  place({ id: "v2-projects-canopy", name: "Project exhibition canopy", prefabId: v2("project-exhibition-canopy"), variantId: "large", zoneId: "projects", x: -16, z: -23, rotationY: Math.PI, tags: ["portfolio-v2", "projects", "static", "structure", "display"] });
  addV2Cluster(place, "projects-anchors", v2("project-board"), "medium", "projects", [[-22, -16], [-18, -22], [-12, -20], [-9, -13], [-23, -10], [-14, -9]], ["portfolio-v2", "projects", "interactive-stationary", "project-anchor"]);
  addV2Cluster(place, "projects-workbenches", v2("workbench"), "medium", "projects", [[-21, -12], [-13, -15], [-10, -8]], ["portfolio-v2", "projects", "static", "work-surface"]);
  addV2Cluster(place, "projects-storage", v2("crate-stack"), "small", "projects", [[-26, -12], [-25, -14], [-9, -10], [-8, -12], [-21, -24], [-13, -25]], ["portfolio-v2", "projects", "static", "storage"]);
  addV2Cluster(place, "projects-documents", v2("document-stack"), "medium", "projects", [[-20, -18], [-16, -19], [-12, -18], [-18, -10], [-15, -11]], ["portfolio-v2", "projects", "interactive-stationary", "document"]);
  addV2Cluster(place, "projects-fence", v2("fence-straight"), "medium", "projects", [[-27, -19], [-27, -15], [-27, -11], [-23, -25], [-18, -26], [-12, -25]], ["portfolio-v2", "projects", "static", "infrastructure"]);

  place({ id: "v2-experience-arch", name: "Timeline entrance arch", prefabId: v2("timeline-entrance-arch"), variantId: "medium", zoneId: "experience", markerId: "v2-experience-start", x: 8, z: -18, rotationY: -Math.PI / 4, tags: ["portfolio-v2", "experience", "interactive-stationary", "landmark"] });
  const milestonePrefabs = [v2("milestone-marker-a"), v2("milestone-marker-b"), v2("milestone-marker-c"), v2("milestone-marker-a"), v2("current-position-landmark")];
  const milestoneMarkers = ["v2-experience-01", "v2-experience-02", "v2-experience-03", "v2-experience-current", "v2-experience-current"];
  for (const [index, [x, z]] of [[10.5, -18.5], [13.5, -22], [18, -24], [22, -19], [23.5, -15.5]].entries()) {
    place({ id: `v2-experience-milestone-${index}`, name: `Experience milestone ${index + 1}`, prefabId: milestonePrefabs[index], variantId: index === 4 ? "medium" : "small", zoneId: "experience", markerId: milestoneMarkers[index], x, z, rotationY: -Math.PI / 4, tags: ["portfolio-v2", "experience", "interactive-stationary", index === 4 ? "landmark" : "timeline"] });
  }
  place({ id: "v2-experience-education", name: "Education branch marker", prefabId: v2("education-branch-marker"), zoneId: "experience", markerId: "v2-experience-education", x: 16, z: -13, rotationY: Math.PI / 4, tags: ["portfolio-v2", "experience", "interactive-stationary"] });
  addV2Cluster(place, "experience-rails", v2("timeline-railing"), "short", "experience", [[9, -17], [12, -20], [16, -23], [21, -22], [24, -18]], ["portfolio-v2", "experience", "static", "infrastructure"]);
  addV2Cluster(place, "experience-rocks", v2("large-rock"), "small", "experience", [[7, -21], [12, -25], [20, -27], [26, -18], [20, -12]], ["portfolio-v2", "experience", "static", "rock"]);
  place({ id: "v2-experience-seat", name: "Reflection seat", prefabId: v2("reflection-seat"), zoneId: "experience", x: 21.5, z: -13.5, rotationY: Math.PI / 2, tags: ["portfolio-v2", "experience", "static", "seating"] });

  place({ id: "v2-about-studio", name: "Personal studio", prefabId: v2("personal-studio"), variantId: "medium", zoneId: "about", markerId: "v2-about-profile", x: 17, z: 10.5, rotationY: -Math.PI / 2, tags: ["portfolio-v2", "about", "static", "landmark", "structure"] });
  place({ id: "v2-about-workspace", name: "Exterior workspace", prefabId: v2("exterior-workspace"), variantId: "medium", zoneId: "about", markerId: "v2-about-workspace", x: 14, z: 7.5, rotationY: Math.PI, tags: ["portfolio-v2", "about", "interactive-stationary"] });
  place({ id: "v2-about-profile", name: "Profile pedestal", prefabId: v2("profile-pedestal"), zoneId: "about", markerId: "v2-about-profile", x: 21, z: 8.5, rotationY: Math.PI / 2, tags: ["portfolio-v2", "about", "interactive-stationary"] });
  place({ id: "v2-about-cv", name: "CV stand", prefabId: v2("cv-stand"), zoneId: "about", markerId: "v2-about-cv", x: 21.5, z: 13.5, rotationY: Math.PI / 2, tags: ["portfolio-v2", "about", "interactive-stationary"] });
  addV2Cluster(place, "about-garden", v2("flower-cluster"), "small", "about", [[12, 10], [14, 14], [18, 15], [23, 12], [24, 8]], ["portfolio-v2", "about", "static", "vegetation"]);
  addV2Cluster(place, "about-trees", v2("broad-canopy-tree"), "small", "about", [[12, 15], [24, 15], [25, 6]], ["portfolio-v2", "about", "static", "vegetation"]);

  place({ id: "v2-skills-tree", name: "Central skill tree", prefabId: v2("skill-tree"), variantId: "large", zoneId: "skills", markerId: "v2-skills-tree", x: -18, z: 12, rotationY: Math.PI / 7, tags: ["portfolio-v2", "skills", "static", "landmark"] });
  for (const [name, prefabId, markerId, x, z] of [
    ["frontend", v2("frontend-marker"), "v2-skills-frontend", -25, 7],
    ["backend", v2("backend-marker"), "v2-skills-backend", -16.5, 20],
    ["tooling", v2("tooling-marker"), "v2-skills-tooling", -11, 8],
    ["design", v2("design-ux-marker"), "v2-skills-design", -25, 18],
  ] as const) {
    place({ id: `v2-skills-${name}-marker`, name: `${name} skills`, prefabId, zoneId: "skills", markerId, x, z, rotationY: 0, tags: ["portfolio-v2", "skills", "interactive-stationary", name] });
    place({ id: `v2-skills-${name}-bed`, name: `${name} technology bed`, prefabId: v2("technology-garden-bed"), variantId: "medium", zoneId: "skills", markerId, x: x + 1.4, z: z + 1.2, rotationY: Math.PI / 8, tags: ["portfolio-v2", "skills", "interactive-stationary", "skill-bed"] });
  }
  addV2Cluster(place, "skills-tokens", v2("skill-token"), undefined, "skills", [[-27, 10], [-24, 12], [-20, 15], [-14, 15], [-10, 12], [-13, 21], [-18, 23], [-23, 21], [-28, 17], [-8, 18], [-16, 8], [-21, 6]], ["portfolio-v2", "skills", "interactive-stationary", "future-skill"]);
  addV2Cluster(place, "skills-vegetation", v2("low-shrub"), "small", "skills", [[-29, 11], [-27, 22], [-20, 25], [-10, 23], [-7, 13], [-14, 5]], ["portfolio-v2", "skills", "static", "vegetation"]);
  place({ id: "v2-skills-shelter", name: "Maintenance shelter", prefabId: v2("maintenance-shelter"), zoneId: "skills", x: -9, z: 23, rotationY: -Math.PI / 2, tags: ["portfolio-v2", "skills", "static", "structure"] });

  place({ id: "v2-contact-building", name: "Communication building", prefabId: v2("communication-building"), variantId: "medium", zoneId: "contact", markerId: "v2-contact-main", x: 2.5, z: 23, rotationY: Math.PI, tags: ["portfolio-v2", "contact", "static", "landmark", "structure"] });
  place({ id: "v2-contact-kiosk", name: "Contact kiosk", prefabId: v2("contact-kiosk"), variantId: "small", zoneId: "contact", x: 8.5, z: 24.5, rotationY: -Math.PI / 2, tags: ["portfolio-v2", "contact", "static", "structure"] });
  place({ id: "v2-contact-mailboxes", name: "Mailbox cluster", prefabId: v2("mailbox-cluster"), zoneId: "contact", markerId: "v2-contact-email", x: 6.5, z: 20.5, rotationY: Math.PI, tags: ["portfolio-v2", "contact", "interactive-stationary"] });
  place({ id: "v2-contact-form", name: "Contact form marker", prefabId: v2("contact-form-marker"), zoneId: "contact", markerId: "v2-contact-form", x: -2.5, z: 24.5, rotationY: 0, tags: ["portfolio-v2", "contact", "interactive-stationary"] });
  addV2Cluster(place, "contact-social", v2("social-link-marker"), undefined, "contact", [[0, 19], [4, 18.5], [8, 19.5]], ["portfolio-v2", "contact", "interactive-stationary"]);
  addV2Cluster(place, "contact-flyers", v2("flyer"), "small", "contact", [[-4, 20], [-5, 23], [2, 27], [7, 27], [10, 22]], ["portfolio-v2", "contact", "interactive-stationary", "flyer"]);
  place({ id: "v2-contact-mast", name: "Communication mast", prefabId: v2("communication-mast"), variantId: "tall", zoneId: "contact", x: 10.5, z: 19, rotationY: 0, tags: ["portfolio-v2", "contact", "static", "landmark"] });

  addV2Cluster(place, "outer-west-tree-line", v2("tall-narrow-tree"), "small", undefined, [[-29, -7], [-30, 3], [-29, 14], [-27, 25]], ["portfolio-v2", "static", "vegetation"]);
  addV2Cluster(place, "outer-north-rocks", v2("small-rock-cluster"), "small", undefined, [[-8, -29], [6, -30], [18, -29], [27, -22]], ["portfolio-v2", "static", "rock"]);
  addV2Cluster(place, "outer-south-trees", v2("ornamental-tree"), "small", undefined, [[-8, 28], [5, 29], [18, 28], [27, 22]], ["portfolio-v2", "static", "vegetation"]);
  addV2Cluster(place, "outer-debris-transition", v2("ground-debris"), "small", undefined, [[-2, -25], [12, -24], [27, -12], [25, 13], [-2, 25], [-24, 2]], ["portfolio-v2", "static", "decoration"]);

  return entities;
}

function createPortfolioV2Navigation(): MapNavigationDefinition {
  const nodes = [
    navNode("v2-nav-arrival", "Arrival", -1.5, 1, 0.5, undefined),
    navNode("v2-nav-projects", "Projects", -17.5, 3, -14, "projects"),
    navNode("v2-nav-experience", "Experience", 15, 3, -20, "experience"),
    navNode("v2-nav-about", "About", 17, 2, 10.5, "about"),
    navNode("v2-nav-skills", "Skills", -18, 2, 12, "skills"),
    navNode("v2-nav-contact", "Contact", 2.5, 1, 23, "contact"),
    navNode("v2-nav-north-cross", "North cross path", -4, 2, -9, undefined),
    navNode("v2-nav-south-cross", "South cross path", -7, 1, 18, undefined),
  ];
  return {
    nodes,
    edges: [
      navEdge("v2-nav-arrival", "v2-nav-projects"),
      navEdge("v2-nav-arrival", "v2-nav-experience"),
      navEdge("v2-nav-arrival", "v2-nav-contact"),
      navEdge("v2-nav-arrival", "v2-nav-about"),
      navEdge("v2-nav-arrival", "v2-nav-skills"),
      navEdge("v2-nav-projects", "v2-nav-north-cross"),
      navEdge("v2-nav-north-cross", "v2-nav-experience"),
      navEdge("v2-nav-skills", "v2-nav-south-cross"),
      navEdge("v2-nav-south-cross", "v2-nav-contact"),
      navEdge("v2-nav-about", "v2-nav-contact"),
    ],
    routes: [{ id: "v2-primary-walk", name: "Portfolio v2 primary walk", nodeIds: nodes.map((node) => node.id), tags: ["portfolio-v2"] }],
  };
}

function createPortfolioV2CameraPresets(): MapCameraPreset[] {
  return [
    { id: "overview", label: "V2 overview", cameraPosition: { x: 44, y: 50, z: 62 }, controlsTarget: { x: -2, y: 1, z: 2 }, minDistance: 20, maxDistance: 104, preferredPolarAngle: 0.78, transitionDuration: 1.2 },
    createCameraPreset("v2-projects-focus", "V2 Projects", -34, 24, -26, -17, 2, -14),
    createCameraPreset("v2-experience-focus", "V2 Experience", 33, 30, -33, 17, 3, -19),
    createCameraPreset("v2-about-focus", "V2 About", 36, 24, 25, 17, 1.5, 10),
    createCameraPreset("v2-skills-focus", "V2 Skills", -36, 24, 28, -18, 1.5, 13),
    createCameraPreset("v2-contact-focus", "V2 Contact", 10, 22, 42, 3, 0.8, 23),
  ];
}

function addV2Cluster(
  place: PortfolioPlace,
  prefix: string,
  prefabId: string,
  variantId: string | undefined,
  zoneId: string | undefined,
  points: number[][],
  tags: string[],
) {
  for (const [index, [x, z]] of points.entries()) {
    place({ id: `${prefix}-${index}`, name: prefix.replace(/-/g, " "), prefabId, variantId, zoneId, x, z, rotationY: (index % 4) * Math.PI / 2, tags, optional: true });
  }
}

function createPortfolioMainEntities(world: VoxelWorld, density: "basic" | "rich" = "rich"): PlacedMapEntity[] {
  const entities: PlacedMapEntity[] = [];
  const place = (input: PortfolioPrefabPlacement) => {
    const entity = createPortfolioPrefabEntity(input, world);
    if (entity) {
      entities.push(entity);
    }
  };

  addAuthoredArrivalHub(place);
  addAuthoredProjectsZone(place);

  if (density === "rich") {
    addAuthoredExperienceZone(place);
    addAuthoredAboutZone(place);
    addAuthoredSkillsZone(place);
    addAuthoredContactZone(place);
    addAuthoredRouteInfrastructure(place);
    addAuthoredBoundaryClusters(place);
  }

  return entities;
}

type PortfolioPlace = (input: PortfolioPrefabPlacement) => void;

function addAuthoredArrivalHub(place: PortfolioPlace) {
  place({ id: "arrival-orientation-monument", name: "Central orientation monument", prefabId: "central-orientation-monument", variantId: "tall", markerId: "arrival-point", x: 0, z: 0, rotationY: 0, tags: ["arrival", "static", "landmark", "orientation"] });
  place({ id: "arrival-map-board", name: "Arrival map board", prefabId: "zone-identity-board", variantId: "wide", markerId: "map-center", x: 0, z: -5.8, rotationY: Math.PI, tags: ["arrival", "interactive-stationary", "orientation", "signage"] });
  for (const [id, x, z, rotationY] of [
    ["projects", -4.5, -3.8, -Math.PI / 4],
    ["experience", 4.7, -3.7, Math.PI / 4],
    ["about", 5.6, 1.1, Math.PI / 2],
    ["skills", -5.7, 1.3, -Math.PI / 2],
    ["contact", 0.2, 5.6, 0],
  ] as const) {
    place({ id: `arrival-sign-${id}`, name: `${id} route sign`, prefabId: "central-multi-direction-sign", x, z, rotationY, tags: ["arrival", "static", "signage", "direction-anchor", id] });
  }
  for (const [index, [x, z, rotationY]] of [[-4, 4, Math.PI / 2], [4, 4, -Math.PI / 2], [-4, -1.5, Math.PI / 2], [4, -1.5, -Math.PI / 2]].entries()) {
    place({ id: `arrival-bench-${index}`, name: "Arrival bench", prefabId: "bench", x, z, rotationY, tags: ["arrival", "static", "seating"] });
  }
  for (const [index, [x, z]] of [[-5.8, 5.8], [5.8, 5.8], [-5.8, -5.8], [5.8, -5.8]].entries()) {
    place({ id: `arrival-planter-${index}`, name: "Arrival planter cluster", prefabId: "raised-garden-bed", x, z, rotationY: index % 2 === 0 ? 0 : Math.PI / 2, tags: ["arrival", "static", "vegetation", "plaza-edge"] });
  }
  addLocalCluster(place, "arrival-low-edge", "bollard", undefined, undefined, [[-6, -1], [-6, 1], [-5, 4], [-2, 6], [2, 6], [5, 4], [6, 1], [6, -1], [4, -5], [1, -6], [-1, -6], [-4, -5]], ["arrival", "static", "infrastructure", "plaza-edge"]);
}

function addAuthoredProjectsZone(place: PortfolioPlace) {
  place({ id: "projects-workshop-compound", name: "Projects workshop compound", prefabId: "portfolio-workshop-compound", variantId: "large", zoneId: "projects", markerId: "project-featured", x: -17.5, z: -16.5, rotationY: Math.PI / 12, tags: ["projects", "static", "landmark", "structure"], assetReference: "future/projects-workshop" });
  place({ id: "projects-yard-pavilion", name: "Covered project work yard", prefabId: "open-pavilion", variantId: "medium", zoneId: "projects", x: -23, z: -10.5, rotationY: Math.PI / 2, tags: ["projects", "static", "structure"] });
  place({ id: "projects-storage-annex", name: "Project storage annex", prefabId: "shed", zoneId: "projects", x: -10, z: -11, rotationY: -Math.PI / 2, tags: ["projects", "static", "structure"] });
  place({ id: "projects-display-court", name: "Project exhibition court", prefabId: "project-display-rack", variantId: "wide", zoneId: "projects", markerId: "project-more", x: -16.5, z: -24, rotationY: Math.PI, tags: ["projects", "interactive-stationary", "landmark", "display"] });
  place({ id: "projects-zone-board", name: "Projects entrance board", prefabId: "zone-identity-board", zoneId: "projects", markerId: "project-featured", x: -12, z: -23.5, rotationY: Math.PI, tags: ["projects", "interactive-stationary", "signage"] });
  addFenceLine(place, "projects-north-fence", "projects", -25, -23.5, -8, -23.5, 7);
  addFenceLine(place, "projects-west-fence", "projects", -25, -23, -25, -9, 6);
  const projectAnchors = [
    { x: -22, z: -17, marker: "project-01" },
    { x: -19, z: -22, marker: "project-02" },
    { x: -14, z: -21.5, marker: "project-03" },
    { x: -12, z: -15.5, marker: "project-04" },
    { x: -21.5, z: -11.5, marker: "project-more" },
    { x: -15.5, z: -12, marker: "project-featured" },
  ];
  for (const [index, { x, z, marker }] of projectAnchors.entries()) {
    place({ id: `projects-anchor-${index}`, name: `Project interaction anchor ${index + 1}`, prefabId: index % 2 === 0 ? "project-display-rack" : "presentation-pedestal", variantId: index % 2 === 0 ? "standard" : undefined, zoneId: "projects", markerId: marker, x, z, rotationY: index % 2 === 0 ? Math.PI : 0, tags: ["projects", "interactive-stationary", "project-anchor"] });
  }
  for (const [index, [x, z]] of [[-23, -14], [-12, -18], [-21, -20], [-10, -22]].entries()) {
    place({ id: `projects-workbench-${index}`, name: "Project workbench", prefabId: "development-workbench", zoneId: "projects", x, z, rotationY: index % 2 === 0 ? Math.PI / 2 : 0, tags: ["projects", "static", "work-surface", "set-dressing"] });
  }
  addLocalCluster(place, "projects-storage-crates", "crate", "small", "projects", [[-24, -12], [-23, -13.2], [-22.2, -11.4], [-10.5, -8.8], [-9.4, -9.8], [-8.7, -11.2]], ["static", "set-dressing", "storage"]);
  addLocalCluster(place, "projects-landscape", "low-shrub-cluster", "small", "projects", [[-26, -18], [-24, -20.5], [-11, -24], [-8.5, -14], [-21, -8.5]], ["static", "vegetation", "compound-edge"]);
  addClusterGrid(place, "projects-display-documents", "document-stack", undefined, "projects", -22, -13, -22, -15, 3, 2, ["interactive-stationary", "project-material"]);
  addClusterGrid(place, "projects-window-modules", "wall-with-window", "short", "projects", -23.5, -10.5, -19.5, -19.5, 3.2, 3.2, ["static", "architecture-detail"]);
  addClusterGrid(place, "projects-shelf-yard", "shelf", "small", "projects", -24, -10, -21, -10, 4.5, 3.5, ["static", "set-dressing", "storage"]);
}

function addAuthoredExperienceZone(place: PortfolioPlace) {
  place({ id: "experience-entry-arch", name: "Experience timeline entry arch", prefabId: "timeline-arch", variantId: "wide", zoneId: "experience", markerId: "experience-start", x: 7, z: -13.5, rotationY: -Math.PI / 4, tags: ["experience", "interactive-stationary", "landmark", "timeline"] });
  const milestones = [
    ["experience-milestone-a", 10.5, -16.5, "experience-milestone-01"],
    ["experience-milestone-b", 13.5, -19.2, "experience-milestone-02"],
    ["experience-milestone-c", 16.5, -21, "experience-milestone-03"],
    ["experience-milestone-current", 20.5, -21, "experience-current"],
  ] as const;
  for (const [index, [id, x, z, markerId]] of milestones.entries()) {
    place({ id, name: `Experience milestone station ${index + 1}`, prefabId: "milestone-station", variantId: index === milestones.length - 1 ? "large" : "medium", zoneId: "experience", markerId, x, z, rotationY: -Math.PI / 4, tags: ["experience", "interactive-stationary", "timeline", index === milestones.length - 1 ? "landmark" : "station"] });
  }
  place({ id: "experience-education-branch", name: "Education branch board", prefabId: "zone-identity-board", zoneId: "experience", markerId: "experience-education", x: 14.5, z: -13.5, rotationY: Math.PI / 4, tags: ["experience", "interactive-stationary", "education", "signage"] });
  place({ id: "experience-viewpoint", name: "Current role viewpoint", prefabId: "circular-platform", variantId: "medium", zoneId: "experience", x: 22.5, z: -19, rotationY: 0, tags: ["experience", "static", "platform"] });
  place({ id: "experience-bridge", name: "Experience footbridge", prefabId: "simple-footbridge", zoneId: "experience", x: 5.5, z: -10.5, rotationY: -Math.PI / 4, tags: ["experience", "static", "infrastructure", "structure"] });
  addLocalCluster(place, "experience-rocks", "stacked-rock-cluster", "small", "experience", [[6, -17], [11, -21], [18, -24], [23, -22], [22, -16]], ["static", "vegetation", "terrain-edge"]);
  addLocalCluster(place, "experience-path-lamps", "lamp-post", "short", "experience", [[8.5, -15], [12.5, -18], [16.8, -20.5], [20.5, -18.8]], ["static", "lighting", "infrastructure"]);
  addClusterGrid(place, "experience-plaque-row", "information-pedestal", undefined, "experience", 8, 21, -20.5, -14, 4, 3, ["interactive-stationary", "timeline-plaque"]);
  addClusterGrid(place, "experience-low-retainers", "retaining-wall", "short", "experience", 5, 23, -24, -12, 4.5, 4, ["static", "infrastructure", "terrain-edge"]);
}

function addAuthoredAboutZone(place: PortfolioPlace) {
  place({ id: "about-personal-studio", name: "Personal studio compound", prefabId: "personal-studio-compound", variantId: "wide", zoneId: "about", markerId: "about-introduction", x: 17.5, z: 3.5, rotationY: -Math.PI / 2, tags: ["about", "static", "landmark", "structure"], assetReference: "future/about-studio" });
  place({ id: "about-workstation", name: "About workstation", prefabId: "desk-with-monitor", zoneId: "about", markerId: "about-workspace", x: 15.5, z: 1.5, rotationY: Math.PI, tags: ["about", "interactive-stationary", "workspace"] });
  place({ id: "about-profile-board", name: "Profile display board", prefabId: "zone-identity-board", zoneId: "about", markerId: "about-profile", x: 22, z: 1.5, rotationY: Math.PI / 2, tags: ["about", "interactive-stationary", "profile", "signage"] });
  place({ id: "about-cv-flyer", name: "CV flyer stand", prefabId: "cv-flyer", variantId: "open", zoneId: "about", markerId: "about-cv", x: 22.5, z: 7, rotationY: Math.PI / 2, tags: ["about", "interactive-stationary", "cv"] });
  place({ id: "about-values-board", name: "Values notice board", prefabId: "noticeboard", zoneId: "about", markerId: "about-values", x: 14.2, z: 7, rotationY: -Math.PI / 2, tags: ["about", "interactive-stationary", "values", "signage"] });
  addLocalCluster(place, "about-garden-beds", "raised-garden-bed", "standard", "about", [[13, 8.5], [17, 9.5], [21, 9.2]], ["static", "vegetation", "garden"]);
  addLocalCluster(place, "about-quiet-seating", "bench", "standard", "about", [[13.5, 4.5], [20.5, 10.5]], ["static", "seating"]);
  addLocalCluster(place, "about-private-trees", "wide-canopy-tree", "small", "about", [[12, 10.5], [24, 10.5], [24, 3]], ["static", "vegetation", "privacy-edge"]);
  addClusterGrid(place, "about-shelves-and-books", "shelf", "small", "about", 14, 24, 0, 8, 3.5, 3, ["static", "set-dressing", "personal-display"]);
  addClusterGrid(place, "about-flower-clusters", "flower-patch-marker", undefined, "about", 12, 24, 8.5, 11, 3, 2, ["static", "vegetation", "garden"]);
}

function addAuthoredSkillsZone(place: PortfolioPlace) {
  place({ id: "skills-branch-landmark", name: "Skill branch landmark", prefabId: "skill-branch-landmark", variantId: "large", zoneId: "skills", markerId: "skills-overview", x: -17.5, z: 12.5, rotationY: 0, tags: ["skills", "static", "landmark", "structure"] });
  for (const [name, marker, x, z, rotationY] of [
    ["frontend", "skills-frontend", -24, 9, Math.PI / 8],
    ["backend", "skills-backend", -12, 9, -Math.PI / 8],
    ["tooling", "skills-tooling", -10, 18, -Math.PI / 2],
    ["design", "skills-design", -23, 18, Math.PI / 2],
    ["other", "skills-other", -17.5, 21.5, Math.PI],
  ] as const) {
    place({ id: `skills-${name}-bed`, name: `${name} skill bed`, prefabId: "raised-garden-bed", variantId: "long", zoneId: "skills", markerId: marker, x, z, rotationY, tags: ["skills", "interactive-stationary", "skill-bed", name] });
    place({ id: `skills-${name}-stand`, name: `${name} skill display stand`, prefabId: "skill-display-stand", zoneId: "skills", markerId: marker, x, z: z - 1.2, rotationY, tags: ["skills", "interactive-stationary", "skill-placeholder", name] });
  }
  place({ id: "skills-maintenance-shelter", name: "Skills maintenance shelter", prefabId: "open-shelter", zoneId: "skills", x: -8, z: 22.5, rotationY: -Math.PI / 2, tags: ["skills", "static", "structure"] });
  addLocalCluster(place, "skills-cluster-trees", "columnar-tree", "small", "skills", [[-27, 12], [-26, 17], [-21, 23], [-11, 23], [-7, 14]], ["static", "vegetation", "garden-edge"]);
  addLocalCluster(place, "skills-shrubs", "low-shrub-cluster", "small", "skills", [[-24, 12], [-21, 8], [-14, 7], [-10, 11], [-13, 20], [-22, 20]], ["static", "vegetation", "bed-edge"]);
  addClusterGrid(place, "skills-future-slots", "skill-fruit-placeholder", undefined, "skills", -25, -10, 8, 21, 4, 3, ["interactive-stationary", "skill-placeholder"]);
}

function addAuthoredContactZone(place: PortfolioPlace) {
  place({ id: "contact-communication-station", name: "Communication station", prefabId: "communication-station", zoneId: "contact", markerId: "contact-main", x: 0.5, z: 21.5, rotationY: Math.PI, tags: ["contact", "static", "landmark", "structure"], assetReference: "future/contact-station" });
  place({ id: "contact-mailbox-bank", name: "Mailbox bank", prefabId: "mailbox-bank", variantId: "long", zoneId: "contact", markerId: "contact-email", x: 5.5, z: 23.5, rotationY: Math.PI, tags: ["contact", "interactive-stationary", "mail"] });
  place({ id: "contact-form-counter", name: "Contact form counter", prefabId: "information-pedestal", zoneId: "contact", markerId: "contact-form", x: -3, z: 24.5, rotationY: 0, tags: ["contact", "interactive-stationary", "form"] });
  place({ id: "contact-social-board", name: "Social links notice board", prefabId: "zone-identity-board", zoneId: "contact", markerId: "contact-github", x: -6.5, z: 21.5, rotationY: -Math.PI / 2, tags: ["contact", "interactive-stationary", "github", "linkedin", "signage"] });
  place({ id: "contact-cv-board", name: "CV download board", prefabId: "noticeboard", zoneId: "contact", markerId: "contact-cv", x: 0.5, z: 28.5, rotationY: 0, tags: ["contact", "interactive-stationary", "cv", "signage"] });
  addLocalCluster(place, "contact-waiting-benches", "bench", "standard", "contact", [[-6, 18.5], [6, 18.5], [-4.5, 27]], ["static", "seating"]);
  addLocalCluster(place, "contact-forecourt-planters", "raised-garden-bed", "standard", "contact", [[-8, 24], [8, 24], [-8, 18], [8, 18]], ["static", "vegetation", "forecourt-edge"]);
  addClusterGrid(place, "contact-flyer-board", "cv-flyer", "closed", "contact", -7, 7, 20, 28, 3.5, 4, ["interactive-stationary", "flyer", "future-dynamic-placeholder"]);
  addClusterGrid(place, "contact-mail-sort-props", "envelope", undefined, "contact", -4, 6, 22, 28, 2.5, 3, ["interactive-stationary", "mail", "set-dressing"]);
}

function addAuthoredRouteInfrastructure(place: PortfolioPlace) {
  const routes = [
    [[-3, -3], [-9, -9], [-15, -15]],
    [[4, -4], [9, -11], [15, -18]],
    [[6, 1], [12, 3], [18, 4]],
    [[0, 6], [0, 14], [0, 22]],
    [[-5, 4], [-12, 9], [-18, 14]],
  ];
  for (const [routeIndex, route] of routes.entries()) {
    addPolylineProps(place, `route-curb-${routeIndex}`, "main-path-section", routeIndex % 2 === 0 ? "short" : "medium", undefined, route, ["main-path", "infrastructure"], 3);
    addPolylineProps(place, `route-lamp-${routeIndex}`, "lamp-post", "short", undefined, route, ["main-path", "lighting", "infrastructure"], 6);
  }
  addLocalCluster(place, "route-decision-signs", "directional-signpost", undefined, undefined, [[-8, -8], [8, -9], [11, 3], [-10, 8], [0, 13]], ["static", "signage", "direction-anchor"]);
}

function addAuthoredBoundaryClusters(place: PortfolioPlace) {
  addLocalCluster(place, "outer-tree-cluster-nw", "wide-canopy-tree", "small", undefined, [[-28, -18], [-26, -12], [-22, -26], [-14, -28]], ["static", "vegetation", "boundary-cluster"]);
  addLocalCluster(place, "outer-tree-cluster-ne", "columnar-tree", "small", undefined, [[13, -27], [22, -25], [27, -18], [26, -9]], ["static", "vegetation", "boundary-cluster"]);
  addLocalCluster(place, "outer-tree-cluster-se", "wide-canopy-tree", "small", undefined, [[26, 10], [28, 19], [22, 26], [12, 27]], ["static", "vegetation", "boundary-cluster"]);
  addLocalCluster(place, "outer-rock-cluster-sw", "stacked-rock-cluster", "small", undefined, [[-28, 4], [-29, 12], [-26, 23], [-18, 27], [-8, 28]], ["static", "vegetation", "boundary-cluster"]);
}

function addClusterGrid(
  place: PortfolioPlace,
  prefix: string,
  prefabId: string,
  variantId: string | undefined,
  zoneId: string | undefined,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  stepX: number,
  stepZ: number,
  tags: string[],
) {
  let index = 0;
  for (let z = minZ; z <= maxZ; z += stepZ) {
    for (let x = minX; x <= maxX; x += stepX) {
      place({
        id: `${prefix}-${index}`,
        name: prefix.replace(/-/g, " "),
        prefabId,
        variantId,
        zoneId,
        x,
        z,
        rotationY: (index % 4) * Math.PI / 2,
        tags,
        optional: true,
      });
      index += 1;
    }
  }
}

function addLocalCluster(
  place: PortfolioPlace,
  prefix: string,
  prefabId: string,
  variantId: string | undefined,
  zoneId: string | undefined,
  points: number[][],
  tags: string[],
) {
  for (const [index, point] of points.entries()) {
    place({
      id: `${prefix}-${index}`,
      name: prefix.replace(/-/g, " "),
      prefabId,
      variantId,
      zoneId,
      x: point[0],
      z: point[1],
      rotationY: (index % 4) * Math.PI / 2,
      tags,
      optional: true,
    });
  }
}

function addFenceLine(
  place: PortfolioPlace,
  prefix: string,
  zoneId: string,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  count: number,
) {
  for (let index = 0; index < count; index += 1) {
    const t = count <= 1 ? 0 : index / (count - 1);
    const x = startX + (endX - startX) * t;
    const z = startZ + (endZ - startZ) * t;
    place({
      id: `${prefix}-${index}`,
      name: prefix.replace(/-/g, " "),
      prefabId: "fence",
      variantId: "medium",
      zoneId,
      x,
      z,
      rotationY: Math.atan2(endZ - startZ, endX - startX),
      tags: ["static", "infrastructure", "compound-boundary"],
      optional: true,
    });
  }
}

function addRichArrivalHubPlacements(place: PortfolioPlace) {
  const ring = [
    [-6, -2], [-5, -4], [-3, -5], [0, -6], [3, -5], [5, -4], [6, -2], [7, 0],
    [6, 3], [4, 5], [1, 6], [-2, 6], [-5, 4], [-7, 1], [-7, -1], [-5, -3],
  ];
  for (const [index, [x, z]] of ring.entries()) {
    place({ id: `arrival-plaza-border-${index}`, name: "Arrival plaza border", prefabId: index % 3 === 0 ? "path-border" : "bollard", variantId: index % 3 === 0 ? "short" : undefined, x, z, rotationY: (index % 4) * Math.PI / 2, tags: ["arrival", "static", "plaza-edge", "infrastructure"] });
  }
  for (const [index, [x, z]] of [[-4, 2], [4, 2], [-4, -2], [4, -2], [-1, 5], [2, -5]].entries()) {
    place({ id: `arrival-seat-${index}`, name: "Arrival seating", prefabId: "bench", variantId: index % 2 === 0 ? "standard" : "small", x, z, rotationY: (index % 4) * Math.PI / 2, tags: ["arrival", "static", "seating"] });
  }
  for (const [index, [x, z]] of [[-6, -6], [6, -6], [-6, 6], [6, 6], [0, -8], [8, 0], [0, 8], [-8, 0]].entries()) {
    place({ id: `arrival-lamp-${index}`, name: "Arrival lamp", prefabId: "lamp-post", variantId: index % 2 === 0 ? "short" : "tall", x, z, rotationY: 0, tags: ["arrival", "static", "lighting", "infrastructure"] });
  }
  for (const [index, [x, z]] of [[-3, 6], [3, 6], [-6, 3], [6, -3], [-3, -6], [3, -6]].entries()) {
    place({ id: `arrival-planter-${index}`, name: "Arrival planter", prefabId: "planter", variantId: index % 2 === 0 ? "small" : "large", x, z, rotationY: 0, tags: ["arrival", "static", "vegetation"] });
    place({ id: `arrival-flower-${index}`, name: "Arrival flower marker", prefabId: "flower-patch-marker", x: x + 0.7, z: z + 0.3, rotationY: 0, tags: ["arrival", "static", "vegetation", "detail"] });
  }
  place({ id: "arrival-welcome-planter", name: "Arrival welcome planter", prefabId: "planter", variantId: "small", x: 2.5, z: 5.5, rotationY: 0, tags: ["arrival", "static", "vegetation"] });
  place({ id: "arrival-intro-noticeboard", name: "Portfolio intro noticeboard", prefabId: "noticeboard", markerId: "map-center", x: -1.5, z: -7.5, rotationY: Math.PI, tags: ["arrival", "interactive-stationary", "introduction"] });
  place({ id: "arrival-roundabout-base", name: "Arrival roundabout base", prefabId: "central-roundabout-base", x: 0, z: 0, rotationY: 0, tags: ["arrival", "static", "landmark"] });
  place({ id: "arrival-map-pedestal", name: "Arrival map pedestal", prefabId: "information-pedestal", markerId: "arrival-point", x: 1.5, z: -1.5, rotationY: Math.PI / 4, tags: ["arrival", "interactive-stationary", "orientation"] });
}

function addProjectsCompoundPlacements(place: PortfolioPlace) {
  for (const [index, item] of [
    ["projects-annex-shed", "Shed", "shed", -25, -12, Math.PI / 2],
    ["projects-storage-building", "Storage building", "building-mass", -9, -10, -Math.PI / 2],
    ["projects-display-platform", "Featured display platform", "square-platform", -15, -23, 0],
    ["projects-scaffold-a", "Workshop scaffold", "elevated-walkway", -11, -19, Math.PI / 2],
  ].entries()) {
    place({ id: item[0] as string, name: item[1] as string, prefabId: item[2] as string, variantId: index === 1 ? "medium" : undefined, zoneId: "projects", x: item[3] as number, z: item[4] as number, rotationY: item[5] as number, tags: ["projects", "static", "structure", index < 3 ? "landmark" : "infrastructure"] });
  }
  addRectPerimeter(place, "projects-fence", "fence", "medium", -24, -22, -8, -8, "projects", ["compound-boundary"]);
  addGrid(place, "projects-crate-yard", "crate", "small", "projects", -26, -22, -23, -18, 2, 2, ["storage", "set-dressing"]);
  addGrid(place, "projects-barrel-yard", "barrel", undefined, "projects", -12, -8, -23, -18, 2, 2, ["storage", "set-dressing"]);
  addGrid(place, "projects-documents", "document-stack", undefined, "projects", -21, -12, -15, -10, 3, 2, ["interactive-stationary", "project-material"]);
  addGrid(place, "projects-monitors", "project-display-monitor", undefined, "projects", -22, -13, -21, -12, 3, 3, ["interactive-stationary", "display"]);
  addGrid(place, "projects-landscape-bush", "bush", "small", "projects", -24, -9, -22, -9, 5, 5, ["vegetation", "compound-edge"]);
  for (const [index, [x, z]] of [[-25, -20], [-23, -9], [-15, -8], [-9, -17], [-19, -25], [-28, -14], [-12, -24], [-8, -12]].entries()) {
    place({ id: `projects-lamp-${index}`, name: "Projects work light", prefabId: "lamp-post", variantId: index % 2 === 0 ? "short" : "tall", zoneId: "projects", x, z, rotationY: 0, tags: ["projects", "static", "lighting"], optional: true });
  }
}

function addExperienceRoutePlacements(place: PortfolioPlace) {
  const stations = [[6.5, -13.5], [9.5, -16.5], [12.5, -19.5], [15.5, -21.5], [19.5, -21.5], [14.5, -14.5], [20.5, -16.5]];
  for (const [index, [x, z]] of stations.entries()) {
    place({ id: `experience-landing-${index}`, name: "Experience landing", prefabId: index % 2 === 0 ? "circular-platform" : "square-platform", variantId: index % 2 === 0 ? "medium" : "small", zoneId: "experience", x, z, rotationY: 0, tags: ["experience", "static", "platform", index < 5 ? "landmark" : "branch"] });
    place({ id: `experience-date-post-${index}`, name: "Experience date post", prefabId: "experience-date-post", zoneId: "experience", x: x + 1.2, z: z - 0.8, rotationY: -Math.PI / 4, tags: ["experience", "interactive-stationary", "timeline"] });
  }
  addPolylineProps(place, "experience-route-marker", "roadside-marker", undefined, "experience", [[5, -12], [8, -15], [11, -18], [14, -21], [18, -22], [22, -20]], ["path-marker"], 2);
  addPolylineProps(place, "experience-retaining-wall", "retaining-wall", "short", "experience", [[4, -11], [8, -14], [12, -17], [16, -20], [21, -19]], ["retaining-edge"], 1);
  for (const [index, [x, z]] of [[7, -19], [11, -23], [16, -25], [22, -23], [23, -16], [17, -12], [10, -11]].entries()) {
    place({ id: `experience-rock-plant-${index}`, name: "Experience edge rock", prefabId: index % 3 === 0 ? "boulder-cluster" : "rock", variantId: index % 3 === 1 ? "small" : undefined, zoneId: "experience", x, z, rotationY: 0, tags: ["experience", "static", "landscape"], optional: true });
  }
  place({ id: "experience-bridge", name: "Experience footbridge", prefabId: "simple-footbridge", zoneId: "experience", x: 5.5, z: -10.5, rotationY: -Math.PI / 4, tags: ["experience", "static", "infrastructure", "structure"] });
}

function addAboutStudioPlacements(place: PortfolioPlace) {
  for (const item of [
    ["about-porch", "Porch", "porch", "wide", 18, 6.5, -Math.PI / 2],
    ["about-awning", "Awning", "awning", "wide", 19.5, 2.5, -Math.PI / 2],
    ["about-side-shed", "Side working shed", "shed", undefined, 24, 9, Math.PI],
    ["about-terrace-platform", "About terrace platform", "rectangular-platform", "large", 14, 8.5, 0],
  ] as const) {
    place({ id: item[0], name: item[1], prefabId: item[2], variantId: item[3], zoneId: "about", x: item[4], z: item[5], rotationY: item[6], tags: ["about", "static", "structure"] });
  }
  addRectPerimeter(place, "about-garden-fence", "fence", "short", 11, -1, 27, 12, "about", ["garden-boundary"]);
  addGrid(place, "about-shelf-row", "shelf", "small", "about", 21, 25, 0, 6, 2, 2, ["furniture", "set-dressing"]);
  addGrid(place, "about-personal-props", "coffee-cup-proxy", undefined, "about", 15, 23, 3, 9, 2, 2, ["personal", "set-dressing"]);
  addGrid(place, "about-planter-row", "planter", "small", "about", 12, 26, 10, 12, 2, 1, ["vegetation"]);
  addGrid(place, "about-garden-flowers", "flower-patch-marker", undefined, "about", 12, 26, 8, 12, 3, 2, ["vegetation", "garden-detail"]);
  addGrid(place, "about-garden-bushes", "bush", "small", "about", 11, 27, -1, 12, 5, 5, ["vegetation", "garden-boundary"]);
  for (const [index, [x, z]] of [[13, 1], [25, 2], [13, 11], [25, 11], [18, 12], [27, 6]].entries()) {
    place({ id: `about-lamp-${index}`, name: "About warm lamp", prefabId: "lamp-post", variantId: "short", zoneId: "about", x, z, rotationY: 0, tags: ["about", "static", "lighting"], optional: true });
  }
}

function addSkillsGardenPlacements(place: PortfolioPlace) {
  const clusters = [
    ["frontend", -23, 9], ["backend", -14, 8], ["tooling", -10, 16], ["design", -23, 18], ["other", -17, 21],
  ] as const;
  for (const [name, cx, cz] of clusters) {
    addRing(place, `skills-${name}-bed`, "path-border", "short", cx, cz, 3.2, 8, "skills", ["skill-bed", name]);
    for (let index = 0; index < 5; index += 1) {
      const angle = index * 1.256 + cx * 0.03;
      place({ id: `skills-${name}-fruit-${index}`, name: `${name} skill object`, prefabId: index % 2 === 0 ? "skill-fruit-placeholder" : "presentation-pedestal", zoneId: "skills", x: cx + Math.cos(angle) * 1.6, z: cz + Math.sin(angle) * 1.6, rotationY: angle, tags: ["skills", "interactive-stationary", "skill-placeholder", name] });
    }
  }
  addGrid(place, "skills-orchard-tree", "orchard-tree", "small", "skills", -27, -8, 6, 24, 6, 6, ["vegetation", "orchard"]);
  addGrid(place, "skills-bush-mass", "bush", "medium", "skills", -29, -7, 8, 25, 6, 6, ["vegetation", "edge"]);
  addGrid(place, "skills-grass", "grass-clump", undefined, "skills", -28, -8, 7, 24, 5, 5, ["vegetation", "detail"]);
  addGrid(place, "skills-flower-beds", "flower-patch-marker", undefined, "skills", -26, -10, 9, 23, 4, 4, ["vegetation", "skill-bed-detail"]);
  place({ id: "skills-maintenance-shed", name: "Skills maintenance shed", prefabId: "shed", zoneId: "skills", x: -8, z: 22.5, rotationY: -Math.PI / 2, tags: ["skills", "static", "structure"] });
}

function addContactStationPlacements(place: PortfolioPlace) {
  for (const item of [
    ["contact-post-office", "Contact post office", "building-mass", "small", 0, 26, Math.PI],
    ["contact-writing-shelter", "Writing shelter", "open-shelter", undefined, -6, 22, Math.PI / 2],
    ["contact-radio-mast", "Communication mast", "utility-pole", undefined, 8, 24, 0],
    ["contact-waiting-platform", "Contact forecourt", "rectangular-platform", "medium", 0, 18, 0],
  ] as const) {
    place({ id: item[0], name: item[1], prefabId: item[2], variantId: item[3], zoneId: "contact", x: item[4], z: item[5], rotationY: item[6], tags: ["contact", "static", "structure", item[0].includes("mast") ? "landmark" : "infrastructure"] });
  }
  addRectPerimeter(place, "contact-curb", "simple-barrier", undefined, -9, 16, 9, 29, "contact", ["forecourt-boundary"]);
  addGrid(place, "contact-mailbox-bank", "mailbox", undefined, "contact", 4, 8, 21, 27, 2, 2, ["interactive-stationary", "mail"]);
  addGrid(place, "contact-flyer-scatter", "flyer-start-point", undefined, "contact", -8, 8, 15, 29, 7, 7, ["interactive-stationary", "flyer", "future-dynamic-placeholder"]);
  addGrid(place, "contact-forecourt-planters", "planter", "small", "contact", -8, 8, 16, 28, 4, 4, ["vegetation", "forecourt-edge"]);
  for (const [index, [x, z]] of [[-8, 18], [8, 18], [-8, 27], [8, 27], [0, 15], [0, 30]].entries()) {
    place({ id: `contact-lamp-${index + 2}`, name: "Contact lamp", prefabId: "lamp-post", variantId: index % 2 === 0 ? "short" : "tall", zoneId: "contact", x, z, rotationY: 0, tags: ["contact", "static", "lighting"], optional: true });
  }
}

function addWorldInfrastructurePlacements(place: PortfolioPlace) {
  const routePoints = [
    [[0, 0], [-5, -5], [-10, -10], [-16, -16]],
    [[0, 0], [6, -7], [11, -14], [17, -20]],
    [[0, 0], [8, 1], [15, 3], [20, 5]],
    [[0, 0], [0, 9], [0, 16], [0, 23]],
    [[0, 0], [-8, 5], [-15, 11], [-20, 17]],
  ];
  for (const [routeIndex, route] of routePoints.entries()) {
    addPolylineProps(place, `main-road-border-${routeIndex}`, "path-border", routeIndex % 2 === 0 ? "long" : "medium", undefined, route, ["main-path", "infrastructure"], 2);
    addPolylineProps(place, `main-road-light-${routeIndex}`, "roadside-marker", undefined, undefined, route, ["main-path", "marker"], 3);
  }
  addPolylineProps(place, "secondary-loop-west", "junction-marker", undefined, undefined, [[-18, -16], [-4, -20], [14, -20], [20, -20]], ["secondary-path"], 2);
  addPolylineProps(place, "secondary-loop-south", "path-corner-border", undefined, undefined, [[-18, 16], [-8, 22], [0, 23], [12, 16], [18, 5]], ["secondary-path"], 2);
  addGrid(place, "world-boundary-post", "boundary-post", undefined, undefined, -28, 28, -26, 28, 14, 14, ["world-edge", "infrastructure"]);
}

function addGrid(
  place: PortfolioPlace,
  prefix: string,
  prefabId: string,
  variantId: string | undefined,
  zoneId: string | undefined,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  stepX: number,
  stepZ: number,
  tags: string[],
) {
  let index = 0;
  for (let z = minZ; z <= maxZ; z += stepZ) {
    for (let x = minX; x <= maxX; x += stepX) {
      const offsetX = Math.sin((index + 1) * 12.9898) * 0.35;
      const offsetZ = Math.cos((index + 1) * 78.233) * 0.35;
      place({
        id: `${prefix}-${index}`,
        name: prefix.replace(/-/g, " "),
        prefabId,
        variantId,
        zoneId,
        x: clampWorld(x + offsetX),
        z: clampWorld(z + offsetZ),
        rotationY: (index % 4) * Math.PI / 2,
        tags,
        optional: true,
      });
      index += 1;
    }
  }
}

function addRectPerimeter(
  place: PortfolioPlace,
  prefix: string,
  prefabId: string,
  variantId: string | undefined,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  zoneId: string,
  tags: string[],
) {
  let index = 0;
  for (let x = minX; x <= maxX; x += 2) {
    place({ id: `${prefix}-north-${index}`, name: prefix, prefabId, variantId, zoneId, x, z: minZ, rotationY: 0, tags: ["static", "infrastructure", ...tags], optional: true });
    place({ id: `${prefix}-south-${index}`, name: prefix, prefabId, variantId, zoneId, x, z: maxZ, rotationY: 0, tags: ["static", "infrastructure", ...tags], optional: true });
    index += 1;
  }
  for (let z = minZ + 2; z <= maxZ - 2; z += 2) {
    place({ id: `${prefix}-west-${index}`, name: prefix, prefabId, variantId, zoneId, x: minX, z, rotationY: Math.PI / 2, tags: ["static", "infrastructure", ...tags], optional: true });
    place({ id: `${prefix}-east-${index}`, name: prefix, prefabId, variantId, zoneId, x: maxX, z, rotationY: Math.PI / 2, tags: ["static", "infrastructure", ...tags], optional: true });
    index += 1;
  }
}

function addRing(
  place: PortfolioPlace,
  prefix: string,
  prefabId: string,
  variantId: string | undefined,
  centerX: number,
  centerZ: number,
  radius: number,
  count: number,
  zoneId: string,
  tags: string[],
) {
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count;
    place({
      id: `${prefix}-${index}`,
      name: prefix.replace(/-/g, " "),
      prefabId,
      variantId,
      zoneId,
      x: centerX + Math.cos(angle) * radius,
      z: centerZ + Math.sin(angle) * radius,
      rotationY: angle + Math.PI / 2,
      tags: ["static", "infrastructure", ...tags],
      optional: true,
    });
  }
}

function addPolylineProps(
  place: PortfolioPlace,
  prefix: string,
  prefabId: string,
  variantId: string | undefined,
  zoneId: string | undefined,
  points: number[][],
  tags: string[],
  spacing: number,
) {
  let id = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    const distance = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.floor(distance / spacing));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const side = id % 2 === 0 ? 1 : -1;
      const normalX = distance === 0 ? 0 : (-dz / distance) * side;
      const normalZ = distance === 0 ? 0 : (dx / distance) * side;
      place({
        id: `${prefix}-${id}`,
        name: prefix.replace(/-/g, " "),
        prefabId,
        variantId,
        zoneId,
        x: start[0] + dx * t + normalX * 1.7,
        z: start[1] + dz * t + normalZ * 1.7,
        rotationY: Math.atan2(dx, dz),
        tags: ["static", "infrastructure", ...tags],
        optional: true,
      });
      id += 1;
    }
  }
}

function createPortfolioMainNavigation(): MapNavigationDefinition {
  const nodes = [
    navNode("nav-center", "Arrival", 0, 0.5, 0, undefined),
    navNode("nav-projects", "Projects", -17.5, 1.5, -16.5, "projects"),
    navNode("nav-experience", "Experience", 12, 1.5, -17, "experience"),
    navNode("nav-about", "About", 17.5, 1.5, 3.5, "about"),
    navNode("nav-skills", "Skills", -17.5, 1.5, 12.5, "skills"),
    navNode("nav-contact", "Contact", 0.5, 0.5, 21.5, "contact"),
    navNode("nav-projects-experience", "Projects to Experience", -4, 1.5, -20, undefined),
    navNode("nav-skills-contact", "Skills to Contact", -7, 1.5, 19, undefined),
    navNode("nav-about-contact", "About to Contact", 11, 1.5, 15, undefined),
  ];
  const edges = [
    navEdge("nav-center", "nav-projects"),
    navEdge("nav-center", "nav-experience"),
    navEdge("nav-center", "nav-about"),
    navEdge("nav-center", "nav-skills"),
    navEdge("nav-center", "nav-contact"),
    navEdge("nav-projects", "nav-projects-experience"),
    navEdge("nav-projects-experience", "nav-experience"),
    navEdge("nav-skills", "nav-skills-contact"),
    navEdge("nav-skills-contact", "nav-contact"),
    navEdge("nav-about", "nav-about-contact"),
    navEdge("nav-about-contact", "nav-contact"),
  ];
  return {
    nodes,
    edges,
    routes: [{
      id: "portfolio-primary-loop",
      name: "Portfolio primary circulation",
      nodeIds: ["nav-center", "nav-projects", "nav-projects-experience", "nav-experience", "nav-center", "nav-about", "nav-about-contact", "nav-contact", "nav-skills-contact", "nav-skills", "nav-center"],
      tags: ["portfolio-main", "primary-path"],
    }],
  };
}

function createPortfolioMainCameraPresets(): MapCameraPreset[] {
  return [
    { id: "overview", label: "Portfolio overview", cameraPosition: { x: 42, y: 50, z: 62 }, controlsTarget: { x: 0, y: 0, z: 0 }, minDistance: 20, maxDistance: 104, preferredPolarAngle: 0.78, transitionDuration: 1.2 },
    createCameraPreset("projects-focus", "Projects focus", -34, 24, -26, -17, 1.4, -16),
    createCameraPreset("experience-focus", "Experience focus", 26, 28, -34, 13, 1.8, -17),
    createCameraPreset("experience-current-focus", "Current experience focus", 34, 28, -30, 20, 2.2, -21),
    createCameraPreset("about-focus", "About focus", 38, 24, 18, 18, 1.2, 4),
    createCameraPreset("skills-focus", "Skills focus", -34, 25, 28, -17, 1.4, 13),
    createCameraPreset("contact-focus", "Contact focus", 8, 24, 42, 1, 0.8, 22),
    { id: "benchmark-dense-focus", label: "Benchmark dense focus", cameraPosition: { x: -28, y: 20, z: -28 }, controlsTarget: { x: -17, y: 1, z: -16 }, transitionDuration: 0.8 },
  ];
}

type PortfolioPrefabPlacement = {
  id: string;
  name: string;
  prefabId: string;
  variantId?: string;
  zoneId?: string;
  markerId?: string;
  x: number;
  y?: number;
  z: number;
  rotationY: number;
  tags: string[];
  assetReference?: string;
  snapToTerrain?: boolean;
  optional?: boolean;
};

function createPortfolioPrefabEntity(input: PortfolioPrefabPlacement, world?: VoxelWorld): PlacedMapEntity | null {
  const prefab = BUILT_IN_PREFABS.find((candidate) => candidate.id === input.prefabId);
  if (!prefab) {
    throw new Error(`Unknown portfolio prefab: ${input.prefabId}`);
  }
  const variant = input.variantId
    ? prefab.variants.find((candidate) => candidate.id === input.variantId)
    : prefab.variants.find((candidate) => candidate.id === prefab.defaultVariantId) ?? prefab.variants[0];
  if (!variant) {
    throw new Error(`Unknown portfolio prefab variant: ${input.prefabId}/${input.variantId}`);
  }
  const positionY = input.y ?? 0;

  const entity = createPlacedEntity({
    id: input.id,
    name: input.name,
    entityType: "prefab",
    primitiveType: "box",
    prefabId: prefab.id,
    prefabVersion: prefab.version,
    variantId: variant.id,
    transform: {
      position: { x: input.x, y: positionY, z: input.z },
      rotation: { x: 0, y: input.rotationY, z: 0 },
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
    collisionMode: input.tags.includes("interactive-stationary") ? "trigger" : prefab.collisionMode,
    zoneId: input.zoneId,
    markerId: input.markerId,
    assetReference: input.assetReference ?? prefab.futureAssetSlot,
    tags: ["portfolio-main", ...input.tags],
  });
  if (!world || input.snapToTerrain === false) {
    return entity;
  }
  const footprint = variant.footprintOverride ?? prefab.footprint;
  const needsFlatSupport = input.tags.includes("structure") || input.tags.includes("landmark");
  const supportMode = needsFlatSupport && (footprint.width > 2.5 || footprint.depth > 2.5)
    ? "entire-footprint"
    : "single-cell";
  const grounded = groundEntityOnTerrain(world, entity, { supportMode, maxSupportHeightDifference: supportMode === "entire-footprint" ? 0.01 : 1 });
  if (!grounded.ok) {
    if (input.optional) {
      return null;
    }
    throw new Error(`Invalid portfolio prefab placement ${input.id}: ${grounded.reason}`);
  }
  return grounded.entity;
}

function portfolioMarker(
  id: string,
  label: string,
  zoneId: string | undefined,
  x: number,
  y: number,
  z: number,
  contentReference: MapMarkerDefinition["contentReference"],
  markerType: MapMarkerDefinition["markerType"],
  focusCameraPresetId: string,
): MapMarkerDefinition {
  return {
    id,
    type: "marker",
    markerType,
    label,
    zoneId,
    gridPosition: { x, y, z },
    rotationY: 0,
    focusCameraPresetId,
    contentReference,
    developmentVisible: true,
    runtimeVisible: true,
    interactionRadius: markerType === "primary" || markerType === "project" || markerType === "contact" ? 1.35 : 1.05,
  };
}

function navNode(id: string, label: string, x: number, y: number, z: number, zoneId: string | undefined) {
  return { id, type: "walk" as const, label, position: { x, y, z }, zoneId, tags: ["portfolio-main"], locked: false };
}

function navEdge(fromNodeId: string, toNodeId: string) {
  return { id: `edge-${fromNodeId.replace(/^nav-/, "")}-${toNodeId.replace(/^nav-/, "")}`, fromNodeId, toNodeId, bidirectional: true, cost: 1, routeTag: "portfolio-main", locked: false };
}

function fillEllipse(world: VoxelWorld, center: GridXZ, radiusX: number, radiusZ: number, elevation: number, blockId: BlockId, zoneId: number) {
  for (let z = Math.max(0, center.z - radiusZ); z <= Math.min(WORLD_CONFIG.depth - 1, center.z + radiusZ); z += 1) {
    for (let x = Math.max(0, center.x - radiusX); x <= Math.min(WORLD_CONFIG.width - 1, center.x + radiusX); x += 1) {
      const dx = (x - center.x) / radiusX;
      const dz = (z - center.z) / radiusZ;
      if (dx * dx + dz * dz <= 1) {
        for (let y = 0; y <= elevation; y += 1) {
          world.setBlock(x, y, z, y === elevation ? blockId : BLOCK_IDS.Ground);
          if (zoneId > 0) world.setZone(x, y, z, zoneId);
        }
      }
    }
  }
}

function drawPath(world: VoxelWorld, points: GridXZ[], halfWidth: number) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const steps = Math.max(Math.abs(end.x - start.x), Math.abs(end.z - start.z));
    for (let step = 0; step <= steps; step += 1) {
      const x = Math.round(start.x + ((end.x - start.x) * step) / Math.max(steps, 1));
      const z = Math.round(start.z + ((end.z - start.z) * step) / Math.max(steps, 1));
      for (let oz = -halfWidth; oz <= halfWidth; oz += 1) {
        for (let ox = -halfWidth; ox <= halfWidth; ox += 1) {
          if (Math.abs(ox) + Math.abs(oz) <= halfWidth + 1) {
            const px = x + ox;
            const pz = z + oz;
            if (px >= 0 && px < WORLD_CONFIG.width && pz >= 0 && pz < WORLD_CONFIG.depth) {
              const topY = Math.min(3, Math.max(0, getTopY(world, px, pz)));
              for (let y = 0; y <= topY; y += 1) {
                world.setBlock(px, y, pz, y === topY ? BLOCK_IDS.Path : BLOCK_IDS.Ground);
              }
            }
          }
        }
      }
    }
  }
}

function addExperienceRise(world: VoxelWorld) {
  forRect(world, 40, 13, 46, 16, 1, BLOCK_IDS.Path);
  forRect(world, 43, 10, 52, 13, 1, BLOCK_IDS.Path);
  forRect(world, 43, 10, 52, 13, 2, BLOCK_IDS.ZoneGround);
  forRectZone(world, 40, 10, 52, 16, 1, 2);
  forRectZone(world, 43, 10, 52, 13, 2, 2);
}

function addLowBoundaries(world: VoxelWorld) {
  for (const point of [
    { x: 5, z: 9 }, { x: 6, z: 23 }, { x: 24, z: 7 }, { x: 55, z: 8 }, { x: 58, z: 38 },
    { x: 45, z: 58 }, { x: 20, z: 57 }, { x: 6, z: 47 }, { x: 4, z: 31 },
  ]) {
    fillEllipse(world, point, 2, 2, 1, BLOCK_IDS.Boundary, 0);
  }
}

function getTopY(world: VoxelWorld, x: number, z: number) {
  return world.getHighestNonAirY(x, z) ?? 0;
}

function distanceSq(x: number, z: number, centerX: number, centerZ: number) {
  const dx = x - centerX;
  const dz = z - centerZ;
  return dx * dx + dz * dz;
}

function distanceToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq));
  const px = ax + dx * t;
  const pz = az + dz * t;
  return Math.hypot(x - px, z - pz);
}

function inEllipse(x: number, z: number, center: GridXZ, radiusX: number, radiusZ: number) {
  const dx = (x - center.x) / radiusX;
  const dz = (z - center.z) / radiusZ;
  return dx * dx + dz * dz <= 1;
}

function clampWorld(value: number) {
  return Math.max(-31.5, Math.min(31.5, value));
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

  const columns = 16;
  const spacing = 4;
  for (const [index, placement] of placements.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = -30 + column * spacing;
    const z = -30 + row * spacing;
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
