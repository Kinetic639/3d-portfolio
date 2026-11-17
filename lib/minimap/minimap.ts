import { createLoadedMapState, type MapDefinition } from "@/lib/maps/map-definition";
import type { MapContentReference } from "@/lib/maps/map-definition";
import { getSurfaceTextureKind } from "@/lib/terrain/surface-faces";
import { BLOCK_IDS } from "@/lib/world/block-registry";

/**
 * The portfolio's map from above: what `pnpm assets` draws into the minimap
 * image, and the zone shapes and item pins that the landing page and the
 * world's corner map lay over it as SVG.
 *
 * Coordinates in the data are map columns relative to the playable area's
 * corner (0..width, 0..depth); world x = column + offsetX, world z = row + offsetZ.
 */

export const MINIMAP_VERSION = 1;

export type MinimapZone = {
  id: string;
  numericId: number;
  label: string;
  color: string;
  /** SVG path of the zone's area (rows of cells), in map columns. */
  area: string;
  /** SVG path of the zone's outline (cell edges between it and other ground). */
  outline: string;
  /** Where its name goes: the zone's column nearest its middle (cell centre). */
  labelX: number;
  labelZ: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  contentReference?: MapContentReference;
};

export type MinimapPin = {
  entityId: string;
  /** Cell-centre position, in map columns. */
  x: number;
  z: number;
  contentReference: MapContentReference;
};

export type MinimapData = {
  version: number;
  mapId: string;
  /** Size of the drawn area in columns. */
  width: number;
  depth: number;
  /** World coordinates of the area's corner: world x = column + offsetX. */
  offsetX: number;
  offsetZ: number;
  /** Image URL, with a content hash so it can be cached for good. */
  image: string;
  zones: MinimapZone[];
  pins: MinimapPin[];
};

export type MinimapColumns = {
  width: number;
  depth: number;
  offsetX: number;
  offsetZ: number;
  /** Top solid block's height (top face y) per column; -128 for none. */
  heights: Int16Array;
  /** Surface texture kind of the top face per column (SURFACE_TEXTURE_KINDS). */
  textures: Uint8Array;
  /** Zone numeric id per column; 0 for none. */
  zones: Uint8Array;
};

/** Reads the playable area of a map column by column. */
export function readMinimapColumns(definition: MapDefinition): MinimapColumns {
  const { world } = createLoadedMapState(definition);
  const bounds = definition.playableBounds;
  const width = bounds.maxX - bounds.minX + 1;
  const depth = bounds.maxZ - bounds.minZ + 1;
  const heights = new Int16Array(width * depth);
  const textures = new Uint8Array(width * depth);
  const zones = new Uint8Array(width * depth);
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const gx = x + bounds.minX;
      const gz = z + bounds.minZ;
      const index = x + width * z;
      const top = world.getHighestNonAirY(gx, gz);
      heights[index] = top === null ? -128 : top + 1;
      const block = top === null ? BLOCK_IDS.Air : world.getBlock(gx, top, gz);
      const covered = top !== null && world.getBlock(gx, top + 1, gz) !== BLOCK_IDS.Air;
      textures[index] = getSurfaceTextureKind(block, "py", covered);
      zones[index] = world.zones[gx + world.config.width * gz] ?? 0;
    }
  }
  return {
    width,
    depth,
    offsetX: bounds.minX - world.config.width / 2,
    offsetZ: bounds.minZ - world.config.depth / 2,
    heights,
    textures,
    zones,
  };
}

/** Zone shapes as SVG paths: one rectangle per horizontal run for the area, unit edges joined into lines for the outline. */
export function traceZone(columns: Pick<MinimapColumns, "width" | "depth" | "zones">, numericId: number) {
  const { width, depth, zones } = columns;
  const at = (x: number, z: number) => x >= 0 && z >= 0 && x < width && z < depth && zones[x + width * z] === numericId;
  const area: string[] = [];
  const outline: string[] = [];
  let count = 0;
  let sumX = 0;
  let sumZ = 0;
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let z = 0; z < depth; z += 1) {
    let runStart = -1;
    for (let x = 0; x <= width; x += 1) {
      const inside = x < width && at(x, z);
      if (inside) {
        count += 1;
        sumX += x;
        sumZ += z;
        bounds.minX = Math.min(bounds.minX, x);
        bounds.maxX = Math.max(bounds.maxX, x + 1);
        bounds.minZ = Math.min(bounds.minZ, z);
        bounds.maxZ = Math.max(bounds.maxZ, z + 1);
        if (runStart < 0) runStart = x;
      } else if (runStart >= 0) {
        area.push(`M${runStart} ${z}h${x - runStart}v1h${runStart - x}z`);
        runStart = -1;
      }
    }
  }
  // Horizontal edges, joined along each row; then vertical edges along each column.
  for (let z = 0; z <= depth; z += 1) {
    let start = -1;
    for (let x = 0; x <= width; x += 1) {
      const edge = x < width && at(x, z) !== at(x, z - 1);
      if (edge && start < 0) start = x;
      if (!edge && start >= 0) {
        outline.push(`M${start} ${z}h${x - start}`);
        start = -1;
      }
    }
  }
  for (let x = 0; x <= width; x += 1) {
    let start = -1;
    for (let z = 0; z <= depth; z += 1) {
      const edge = z < depth && at(x, z) !== at(x - 1, z);
      if (edge && start < 0) start = z;
      if (!edge && start >= 0) {
        outline.push(`M${x} ${start}v${z - start}`);
        start = -1;
      }
    }
  }
  if (count === 0) return null;
  const meanX = sumX / count;
  const meanZ = sumZ / count;
  let label = { x: 0, z: 0, distance: Infinity };
  for (let z = bounds.minZ; z < bounds.maxZ; z += 1) {
    for (let x = bounds.minX; x < bounds.maxX; x += 1) {
      if (!at(x, z)) continue;
      const distance = (x - meanX) ** 2 + (z - meanZ) ** 2;
      if (distance < label.distance) label = { x, z, distance };
    }
  }
  return { area: area.join(""), outline: outline.join(""), labelX: label.x + 0.5, labelZ: label.z + 0.5, bounds };
}

/** Zones and pins of a map, in the minimap's coordinates. */
export function describeMinimap(definition: MapDefinition, columns: MinimapColumns, image: string): MinimapData {
  const zones: MinimapZone[] = [];
  for (const zone of [...definition.zones].sort((a, b) => a.displayOrder - b.displayOrder)) {
    const shape = traceZone(columns, zone.numericId);
    if (!shape) continue;
    zones.push({
      id: zone.id,
      numericId: zone.numericId,
      label: zone.label,
      color: zone.color,
      ...shape,
      ...(zone.contentReference ? { contentReference: { ...zone.contentReference } } : {}),
    });
  }
  const pins: MinimapPin[] = definition.entities
    .filter((entity) => entity.contentReference && entity.appearance.visibleAtRuntime)
    .map((entity) => ({
      entityId: entity.id,
      x: Math.round((entity.transform.position.x - columns.offsetX) * 100) / 100,
      z: Math.round((entity.transform.position.z - columns.offsetZ) * 100) / 100,
      contentReference: { ...entity.contentReference! },
    }))
    .filter((pin) => pin.x >= 0 && pin.z >= 0 && pin.x <= columns.width && pin.z <= columns.depth);
  return {
    version: MINIMAP_VERSION,
    mapId: definition.id,
    width: columns.width,
    depth: columns.depth,
    offsetX: columns.offsetX,
    offsetZ: columns.offsetZ,
    image,
    zones,
    pins,
  };
}
