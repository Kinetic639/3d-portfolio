import type { MapDefinition, MapZoneDefinition } from "./map-definition";

export const EDITOR_ZONE_COUNT = 10;

const DEFAULT_ZONE_COLORS = [
  "#d97757",
  "#eab308",
  "#5fb3b3",
  "#7c9f5b",
  "#8b7bd6",
  "#d16ba5",
  "#5f8fd7",
  "#c68a3d",
  "#6fbf73",
  "#d85f5f",
];

export function ensureEditableZones(map: MapDefinition, count = EDITOR_ZONE_COUNT): MapDefinition {
  const byNumericId = new Map(map.zones.map((zone) => [zone.numericId, zone]));
  const zones: MapZoneDefinition[] = [];

  for (let numericId = 1; numericId <= count; numericId += 1) {
    const existing = byNumericId.get(numericId);
    zones.push(existing ? { ...existing } : createDefaultZone(numericId));
  }

  for (const zone of map.zones) {
    if (zone.numericId > count) zones.push({ ...zone });
  }

  return {
    ...map,
    zones,
    metadata: { ...map.metadata },
  };
}

export function updateEditableZone(
  map: MapDefinition,
  numericId: number,
  patch: Partial<Pick<MapZoneDefinition, "label" | "shortLabel" | "description" | "color" | "visibleInLegend" | "overlayVisible" | "locked">>,
): MapDefinition {
  return ensureEditableZones({
    ...map,
    zones: ensureEditableZones(map).zones.map((zone) => zone.numericId === numericId ? { ...zone, ...patch } : zone),
    metadata: {
      ...map.metadata,
      updatedAt: new Date().toISOString(),
    },
  });
}

export function resetEditableZone(map: MapDefinition, numericId: number): MapDefinition {
  return ensureEditableZones({
    ...map,
    zones: ensureEditableZones(map).zones.map((zone) => zone.numericId === numericId ? createDefaultZone(numericId) : zone),
    metadata: {
      ...map.metadata,
      updatedAt: new Date().toISOString(),
    },
  });
}

export function createDefaultZone(numericId: number): MapZoneDefinition {
  return {
    id: `zone-${numericId}`,
    numericId,
    label: `Zone ${numericId}`,
    shortLabel: `Z${numericId}`,
    description: "",
    color: DEFAULT_ZONE_COLORS[(numericId - 1) % DEFAULT_ZONE_COLORS.length],
    displayOrder: numericId,
    visibleInLegend: true,
    overlayVisible: true,
    locked: false,
  };
}
