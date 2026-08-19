import { validateMapDefinition, type MapDefinition } from "@/lib/maps/map-definition";
import { validateWorldLayoutDefinition } from "./world-region";
import { WORLD_REGION_IDS, type WorldLayoutDefinition, type WorldRegionId } from "./world-layout-types";

export type WorldLayoutPackage = Readonly<{
  kind: "world-layout-package";
  schemaVersion: 1;
  layout: WorldLayoutDefinition;
  maps: Readonly<Record<string, MapDefinition>>;
}>;

export function createWorldLayoutPackage(
  layout: WorldLayoutDefinition,
  mapsByRegion: Readonly<Record<WorldRegionId, MapDefinition>>,
): WorldLayoutPackage {
  return {
    kind: "world-layout-package",
    schemaVersion: 1,
    layout,
    maps: Object.fromEntries(layout.regions.map((region) => [region.mapId, mapsByRegion[region.id]])),
  };
}

export function parseWorldLayoutPackage(input: unknown): { ok: true; package: WorldLayoutPackage } | { ok: false; errors: string[] } {
  if (!isRecord(input) || input.kind !== "world-layout-package" || input.schemaVersion !== 1) {
    return { ok: false, errors: ["Not a world layout package."] };
  }
  const layoutValidation = validateWorldLayoutDefinition(input.layout);
  if (!layoutValidation.ok) return { ok: false, errors: [...layoutValidation.errors] };
  if (!isRecord(input.maps)) return { ok: false, errors: ["World layout package maps must be an object."] };

  const maps: Record<string, MapDefinition> = {};
  const errors: string[] = [];
  for (const regionId of WORLD_REGION_IDS) {
    if (!layoutValidation.layout.regions.some((region) => region.id === regionId)) errors.push(`Missing region ${regionId}.`);
  }
  for (const region of layoutValidation.layout.regions) {
    const validation = validateMapDefinition(input.maps[region.mapId]);
    if (!validation.ok) {
      errors.push(`${region.id}: ${validation.errors.join(" ")}`);
      continue;
    }
    if (validation.map.id !== region.mapId) errors.push(`${region.id}: expected map ${region.mapId}, received ${validation.map.id}.`);
    maps[region.mapId] = validation.map;
  }
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, package: { kind: "world-layout-package", schemaVersion: 1, layout: layoutValidation.layout, maps } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
