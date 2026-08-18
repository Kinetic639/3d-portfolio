import {
  WORLD_REGION_IDS,
  type WorldLayoutDefinition,
  type WorldLayoutValidationResult,
  type WorldRegionId,
  type WorldRegionReference,
  type WorldRegionSlot,
} from "./world-layout-types";

const REGION_ID_SET = new Set<string>(WORLD_REGION_IDS);

export const WORLD_REGION_SLOTS: Readonly<Record<WorldRegionId, WorldRegionSlot>> = Object.freeze({
  "north-west": Object.freeze({ id: "north-west", role: "scenery", offset: Object.freeze({ x: -1, z: -1 }) }),
  north: Object.freeze({ id: "north", role: "scenery", offset: Object.freeze({ x: 0, z: -1 }) }),
  "north-east": Object.freeze({ id: "north-east", role: "scenery", offset: Object.freeze({ x: 1, z: -1 }) }),
  west: Object.freeze({ id: "west", role: "scenery", offset: Object.freeze({ x: -1, z: 0 }) }),
  center: Object.freeze({ id: "center", role: "playable", offset: Object.freeze({ x: 0, z: 0 }) }),
  east: Object.freeze({ id: "east", role: "scenery", offset: Object.freeze({ x: 1, z: 0 }) }),
  "south-west": Object.freeze({ id: "south-west", role: "scenery", offset: Object.freeze({ x: -1, z: 1 }) }),
  south: Object.freeze({ id: "south", role: "scenery", offset: Object.freeze({ x: 0, z: 1 }) }),
  "south-east": Object.freeze({ id: "south-east", role: "scenery", offset: Object.freeze({ x: 1, z: 1 }) }),
});

export function isWorldRegionId(value: unknown): value is WorldRegionId {
  return typeof value === "string" && REGION_ID_SET.has(value);
}

export function getWorldRegionSlot(regionId: WorldRegionId): WorldRegionSlot {
  return WORLD_REGION_SLOTS[regionId];
}

export function createCenterOnlyWorldLayout(input: {
  id: string;
  name: string;
  centerMapId: string;
}): WorldLayoutDefinition {
  return {
    schemaVersion: 1,
    id: input.id,
    name: input.name,
    regions: [{ id: "center", role: "playable", mapId: input.centerMapId }],
  };
}

export function validateWorldLayoutDefinition(input: unknown): WorldLayoutValidationResult {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ["World layout must be an object."] };
  }

  if (input.schemaVersion !== 1) errors.push("World layout schemaVersion must be 1.");
  if (!isNonEmptyString(input.id)) errors.push("World layout id must be a non-empty string.");
  if (!isNonEmptyString(input.name)) errors.push("World layout name must be a non-empty string.");

  if (!Array.isArray(input.regions)) {
    errors.push("World layout regions must be an array.");
    return { ok: false, errors };
  }

  const regionIds = new Set<WorldRegionId>();
  const mapIds = new Set<string>();
  const regions: WorldRegionReference[] = [];

  for (const candidate of input.regions) {
    if (!isRecord(candidate) || !isWorldRegionId(candidate.id)) {
      errors.push(`Unknown world region id: ${String(isRecord(candidate) ? candidate.id : candidate)}.`);
      continue;
    }

    const regionId = candidate.id;
    if (regionIds.has(regionId)) errors.push(`Duplicate world region id: ${regionId}.`);
    regionIds.add(regionId);

    const expectedRole = WORLD_REGION_SLOTS[regionId].role;
    if (candidate.role !== expectedRole) {
      errors.push(`World region ${regionId} must have role ${expectedRole}.`);
    }

    if (!isNonEmptyString(candidate.mapId)) {
      errors.push(`World region ${regionId} mapId must be a non-empty string.`);
      continue;
    }

    const mapId = candidate.mapId.trim();
    if (mapIds.has(mapId)) errors.push(`Duplicate world region mapId: ${mapId}.`);
    mapIds.add(mapId);
    regions.push({ id: regionId, role: expectedRole, mapId });
  }

  if (!regionIds.has("center")) errors.push("World layout must include the center region.");
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    layout: {
      schemaVersion: 1,
      id: (input.id as string).trim(),
      name: (input.name as string).trim(),
      regions,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

