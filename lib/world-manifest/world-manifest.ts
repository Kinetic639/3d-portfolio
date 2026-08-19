import { WORLD_CONFIG } from "@/lib/world/world-config";

export const WORLD_MANIFEST_SCHEMA_VERSION = 1;

export const WORLD_REGION_SLOTS = {
  "north-west": { gridX: 0, gridZ: 0 },
  north: { gridX: 1, gridZ: 0 },
  "north-east": { gridX: 2, gridZ: 0 },
  west: { gridX: 0, gridZ: 1 },
  center: { gridX: 1, gridZ: 1 },
  east: { gridX: 2, gridZ: 1 },
  "south-west": { gridX: 0, gridZ: 2 },
  south: { gridX: 1, gridZ: 2 },
  "south-east": { gridX: 2, gridZ: 2 },
} as const;

export type WorldRegionId = keyof typeof WORLD_REGION_SLOTS;
export type WorldRegionRole = "playable" | "scenery";

export type WorldManifestRegion = {
  id: WorldRegionId;
  gridX: number;
  gridZ: number;
  mapId: string;
  role: WorldRegionRole;
};

export type WorldManifest = {
  schemaVersion: 1;
  id: string;
  dimensions: {
    regionsX: 3;
    regionsZ: 3;
    regionWidth: 64;
    regionDepth: 64;
    minY: number;
    height: number;
  };
  centerRegionId: "center";
  regions: WorldManifestRegion[];
};

export type WorldManifestValidationResult =
  | { ok: true; manifest: WorldManifest }
  | { ok: false; errors: string[] };

export const WORLD_MANIFEST_DIMENSIONS: WorldManifest["dimensions"] = {
  regionsX: 3,
  regionsZ: 3,
  regionWidth: 64,
  regionDepth: 64,
  minY: WORLD_CONFIG.minY,
  height: WORLD_CONFIG.height,
};

export function createCenterOnlyWorldManifest(mapId = "portfolio-primary-flat"): WorldManifest {
  return {
    schemaVersion: WORLD_MANIFEST_SCHEMA_VERSION,
    id: "portfolio-world",
    dimensions: { ...WORLD_MANIFEST_DIMENSIONS },
    centerRegionId: "center",
    regions: [{ id: "center", ...WORLD_REGION_SLOTS.center, mapId, role: "playable" }],
  };
}

export function cloneWorldManifest(manifest: WorldManifest): WorldManifest {
  return {
    ...manifest,
    dimensions: { ...manifest.dimensions },
    regions: manifest.regions.map((region) => ({ ...region })),
  };
}

export function parseWorldManifest(input: unknown, options: { requireComplete?: boolean } = {}): WorldManifestValidationResult {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["World manifest must be an object."] };

  if (input.schemaVersion !== WORLD_MANIFEST_SCHEMA_VERSION) {
    errors.push(`Unsupported world manifest schema version: ${String(input.schemaVersion)}.`);
  }
  if (!isStableId(input.id)) errors.push("World manifest id must be a stable lowercase id.");
  if (input.centerRegionId !== "center") errors.push("World manifest centerRegionId must be center.");
  validateDimensions(input.dimensions, errors);

  if (!Array.isArray(input.regions)) {
    errors.push("World manifest regions must be an array.");
    return { ok: false, errors };
  }

  const ids = new Set<string>();
  const mapIds = new Set<string>();
  const positions = new Set<string>();
  const regions: WorldManifestRegion[] = [];
  let playableCount = 0;

  for (const value of input.regions) {
    if (!isRecord(value)) {
      errors.push("Every world manifest region must be an object.");
      continue;
    }
    const id = value.id;
    if (!isWorldRegionId(id)) {
      errors.push(`Unknown world region id: ${String(id)}.`);
      continue;
    }
    const expected = WORLD_REGION_SLOTS[id];
    if (value.gridX !== expected.gridX || value.gridZ !== expected.gridZ) {
      errors.push(`Region ${id} must use grid position ${expected.gridX},${expected.gridZ}.`);
    }
    if (!isStableId(value.mapId)) errors.push(`Region ${id} must reference a stable map id.`);
    if (value.role !== "playable" && value.role !== "scenery") errors.push(`Region ${id} has invalid role: ${String(value.role)}.`);
    if (id === "center" && value.role !== "playable") errors.push("Center region must be playable.");
    if (id !== "center" && value.role === "playable") errors.push(`Scenery region ${id} cannot be playable.`);

    const position = `${String(value.gridX)},${String(value.gridZ)}`;
    if (ids.has(id)) errors.push(`Duplicate world region id: ${id}.`);
    if (typeof value.mapId === "string" && mapIds.has(value.mapId)) errors.push(`Duplicate region map id: ${value.mapId}.`);
    if (positions.has(position)) errors.push(`Duplicate region grid position: ${position}.`);
    ids.add(id);
    if (typeof value.mapId === "string") mapIds.add(value.mapId);
    positions.add(position);
    if (value.role === "playable") playableCount += 1;

    if (typeof value.mapId === "string" && (value.role === "playable" || value.role === "scenery")) {
      regions.push({ id, gridX: expected.gridX, gridZ: expected.gridZ, mapId: value.mapId, role: value.role });
    }
  }

  if (!ids.has("center")) errors.push("World manifest must include the center region.");
  if (playableCount !== 1) errors.push("World manifest must contain exactly one playable region.");
  if (options.requireComplete && regions.length !== 9) errors.push("Complete world manifest must contain all nine regions.");

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    manifest: {
      schemaVersion: WORLD_MANIFEST_SCHEMA_VERSION,
      id: input.id as string,
      dimensions: { ...WORLD_MANIFEST_DIMENSIONS },
      centerRegionId: "center",
      regions: regions.sort(compareRegions),
    },
  };
}

export function validateWorldManifest(input: unknown, options: { requireComplete?: boolean } = {}) {
  return parseWorldManifest(input, options);
}

function validateDimensions(value: unknown, errors: string[]) {
  if (!isRecord(value)) {
    errors.push("World manifest dimensions are required.");
    return;
  }
  for (const [key, expected] of Object.entries(WORLD_MANIFEST_DIMENSIONS)) {
    if (value[key] !== expected) errors.push(`World manifest dimension ${key} must be ${expected}.`);
  }
}

function compareRegions(left: WorldManifestRegion, right: WorldManifestRegion) {
  return left.gridZ - right.gridZ || left.gridX - right.gridX;
}

function isWorldRegionId(value: unknown): value is WorldRegionId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(WORLD_REGION_SLOTS, value);
}

function isStableId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
