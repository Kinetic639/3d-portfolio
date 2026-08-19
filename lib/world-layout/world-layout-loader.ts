import { createLoadedMapState, type LoadedMapState, type MapDefinition } from "@/lib/maps/map-definition";
import { DEFAULT_AUTHORED_MAP_ID } from "@/lib/maps/map-registry";
import type {
  WorldLayoutDefinition,
  WorldLayoutRuntimeState,
  WorldRegionHydrationState,
  WorldRegionId,
  WorldRegionReference,
} from "./world-layout-types";
import { createCenterOnlyWorldLayout, validateWorldLayoutDefinition } from "./world-region";
import { WORLD_REGION_IDS } from "./world-layout-types";

export const DEFAULT_WORLD_LAYOUT_ID = "portfolio-world";
export const NORTH_SCENERY_MAP_ID = "portfolio-scenery-north";
export const SCENERY_REGION_IDS = WORLD_REGION_IDS.filter((id): id is Exclude<WorldRegionId, "center"> => id !== "center");

export function getSceneryMapId(regionId: Exclude<WorldRegionId, "center">) {
  return `portfolio-scenery-${regionId}`;
}

export type MapDefinitionResolver = (mapId: string) => MapDefinition;

export function createDefaultCenterOnlyWorldLayout(mapId = DEFAULT_AUTHORED_MAP_ID): WorldLayoutDefinition {
  return createCenterOnlyWorldLayout({
    id: DEFAULT_WORLD_LAYOUT_ID,
    name: "Portfolio World",
    centerMapId: mapId,
  });
}

export function createNorthPrototypeWorldLayout(): WorldLayoutDefinition {
  return {
    schemaVersion: 1,
    id: DEFAULT_WORLD_LAYOUT_ID,
    name: "Portfolio World",
    regions: [
      { id: "center", role: "playable", mapId: DEFAULT_AUTHORED_MAP_ID },
      { id: "north", role: "scenery", mapId: NORTH_SCENERY_MAP_ID },
    ],
  };
}

export function createCompleteWorldLayout(): WorldLayoutDefinition {
  return {
    schemaVersion: 1,
    id: DEFAULT_WORLD_LAYOUT_ID,
    name: "Portfolio World",
    regions: WORLD_REGION_IDS.map((id) => ({
      id,
      role: id === "center" ? "playable" as const : "scenery" as const,
      mapId: id === "center" ? DEFAULT_AUTHORED_MAP_ID : getSceneryMapId(id),
    })),
  };
}

export function loadWorldLayoutStateSync(
  definition: WorldLayoutDefinition,
  resolveMap: MapDefinitionResolver,
  requestedRegionIds: readonly WorldRegionId[] = ["center"],
): WorldLayoutRuntimeState<LoadedMapState> {
  const validation = validateWorldLayoutDefinition(definition);
  if (!validation.ok) throw new Error(`World layout ${definition.id} is invalid:\n${validation.errors.join("\n")}`);

  const requested = new Set(requestedRegionIds);
  const references = new Map(validation.layout.regions.map((region) => [region.id, region]));
  for (const regionId of requested) {
    if (!references.has(regionId)) throw new Error(`World layout ${definition.id} does not contain region ${regionId}.`);
  }

  const regions: Partial<Record<WorldRegionId, WorldRegionHydrationState<LoadedMapState>>> = {};
  for (const reference of validation.layout.regions) {
    if (!requested.has(reference.id)) {
      regions[reference.id] = { status: "unloaded" };
      continue;
    }

    regions[reference.id] = loadRegion(reference, resolveMap, definition.id);
  }

  return { definition: validation.layout, regions };
}

function loadRegion(
  reference: WorldRegionReference,
  resolveMap: MapDefinitionResolver,
  layoutId: string,
): WorldLayoutRuntimeState<LoadedMapState>["regions"][WorldRegionId] {
  try {
    const map = resolveMap(reference.mapId);
    if (map.id !== reference.mapId) {
      throw new Error(`resolver returned map ${map.id}`);
    }
    return { status: "ready", region: createLoadedMapState(map) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "error", error: `Failed to load ${layoutId}/${reference.id} (${reference.mapId}): ${message}` };
  }
}
