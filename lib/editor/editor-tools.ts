import { getShapeDefinition } from "@/lib/voxel-shapes/shape-registry";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import type { GridCoordinate } from "@/lib/world/world-config";
import { getTerrainSurfaceAt } from "@/lib/world/surface-query";
import { BLOCK_IDS, type BlockId } from "@/lib/world/block-registry";
import { createTerrainMutations, getTerrainOperationFootprint, DEFAULT_TERRAIN_BRUSH, type TerrainBrushOperation, type TerrainBrushSettings } from "./terrain-brushes";
import { getZoneBrushFootprint, getZoneRectangleFootprint, type ZoneSelectionMode } from "./zone-tools";

/**
 * The editor's tools, as the original editor had them, and what each one
 * does to the map and shows under the pointer. Pure functions over the voxel
 * world: the viewport calls them, the tests check them.
 */
export type EditorTool =
  | "select"
  | "paint"
  | "add"
  | "erase"
  | "raise"
  | "lower"
  | "flatten"
  | "clear"
  | "zone"
  | "marker"
  | "entity"
  | "navigation";

export type EditorMessage = { type: "info" | "error"; text: string };

export type EditorLayerId = "terrain" | "zones" | "entities" | "markers" | "navigation" | "spawnPoints" | "cameraPresets" | "developmentHelpers";

/** Colour of each tool's preview, from the original. */
export const TOOL_COLORS: Record<EditorTool, string> = {
  select: "#38bdf8",
  paint: "#38bdf8",
  add: "#10b981",
  erase: "#ef4444",
  raise: "#10b981",
  lower: "#f97316",
  flatten: "#f59e0b",
  clear: "#ef4444",
  zone: "#eab308",
  marker: "#a855f7",
  entity: "#22c55e",
  navigation: "#60a5fa",
};

export type FlattenPreviewAction = "raise" | "lower" | "unchanged";

export const FLATTEN_PREVIEW_COLORS: Record<FlattenPreviewAction, string> = {
  raise: "#22c55e",
  lower: "#ef4444",
  unchanged: "#94a3b8",
};

/** The terrain operation behind a tool, or null for tools that do not change terrain. */
export function brushOperation(tool: EditorTool): TerrainBrushOperation | null {
  switch (tool) {
    case "add": return "fill";
    case "paint": return "paint";
    case "erase": return "erase";
    case "raise": return "raise";
    case "lower": return "lower";
    case "flatten": return "flatten";
    case "clear": return "clear";
    default: return null;
  }
}

/** Tools that act once, on release, rather than painting while the button is held. Ctrl turns add and erase into strokes. */
export function isSingleShot(tool: EditorTool) {
  return tool === "add" || tool === "erase" || tool === "select" || tool === "entity" || tool === "marker" || tool === "navigation";
}

/** Add and erase repeat under Ctrl, a step at a time. */
export function repeatsWithCtrl(tool: EditorTool) {
  return tool === "add" || tool === "erase";
}

/** Pixels the pointer must travel between repeated add or erase steps. */
export const REPEAT_STEP_PX = 14;

/** Whole cubes for tools that act on cells, a plate on the surface for the rest. */
export function previewStyle(tool: EditorTool): "cube" | "surface" {
  return tool === "add" || tool === "erase" || tool === "clear" ? "cube" : "surface";
}

/** Brush tools use their brush; the others always act on one cell. */
export function effectiveBrush(tool: EditorTool, settings: TerrainBrushSettings): TerrainBrushSettings {
  if (tool === "paint" || tool === "erase" || tool === "raise" || tool === "lower" || tool === "flatten" || tool === "clear" || tool === "zone") return settings;
  return { ...settings, shape: "single", size: 1, pathWidth: 1 };
}

/** The layer a tool edits; a locked layer turns the tool off. */
export function toolLayer(tool: EditorTool): EditorLayerId {
  if (tool === "zone") return "zones";
  if (tool === "marker") return "markers";
  if (tool === "entity") return "entities";
  if (tool === "navigation") return "navigation";
  return "terrain";
}

/** Raise acts above the column's top, lower on it, a marker stands on it. */
export function toolTarget(world: VoxelWorld, tool: EditorTool, cell: GridCoordinate): GridCoordinate | null {
  const top = world.getHighestNonAirY(cell.x, cell.z);
  if (tool === "raise") {
    const y = top === null ? 0 : top + 1;
    return y < world.config.height ? { x: cell.x, y, z: cell.z } : cell;
  }
  if (tool === "lower") return top === null ? cell : { x: cell.x, y: top, z: cell.z };
  if (tool === "marker") {
    if (top !== null && top >= world.config.height - 1) return null;
    const target = { x: cell.x, y: top === null ? cell.y : top + 1, z: cell.z };
    return world.isInsideWorld(target.x, target.y, target.z) ? target : null;
  }
  return cell;
}

/** The block a terrain tool writes. Add uses plain ground unless "Apply material" is on. */
export function toolBlock(tool: EditorTool, blockId: BlockId, applyMaterialToAddedBlocks: boolean): BlockId {
  if (tool === "add" && !applyMaterialToAddedBlocks) return BLOCK_IDS.Ground;
  return blockId;
}

/** Flatten's preview: each column, and whether it will be raised, lowered or left as it is. */
export function flattenPreviewCells(world: VoxelWorld, center: GridCoordinate, settings: TerrainBrushSettings) {
  const desiredY = Math.max(0, Math.min(world.config.height - 1, center.y));
  return getTerrainOperationFootprint(center, "flatten", settings, world.config).map((cell) => {
    const top = world.getHighestNonAirY(cell.x, cell.z);
    const action: FlattenPreviewAction = top === null || top < desiredY ? "raise" : top > desiredY ? "lower" : "unchanged";
    return { coordinate: { x: cell.x, y: top ?? desiredY, z: cell.z }, action, hasSurface: top !== null };
  });
}

export type PreviewInput = {
  world: VoxelWorld;
  tool: EditorTool;
  center: GridCoordinate;
  settings: TerrainBrushSettings;
  blockId: BlockId;
  zoneId: number;
  zoneSelectionMode: ZoneSelectionMode;
  /** Where an area fill started, while the button is held. */
  zoneAnchor: GridCoordinate | null;
};

/**
 * The cells a tool would act on at `center`: what the brush preview outlines.
 * Raise outlines the tops it would build on; tools that change cells outline
 * exactly the cells they would change.
 */
export function previewCells(input: PreviewInput): GridCoordinate[] {
  const { world, tool, center, settings } = input;
  if (tool === "zone") {
    return input.zoneSelectionMode === "rectangle" && input.zoneAnchor
      ? getZoneRectangleFootprint(input.zoneAnchor, center)
      : getZoneBrushFootprint(center, settings, world.config);
  }
  const operation = brushOperation(tool);
  if (!operation) return [{ ...center }];
  if (operation === "raise") {
    return getTerrainOperationFootprint(center, operation, settings, world.config).flatMap((cell) => {
      const top = world.getHighestNonAirY(cell.x, cell.z);
      return top === null ? [] : [{ x: cell.x, y: top, z: cell.z }];
    });
  }
  if (operation === "flatten") return flattenPreviewCells(world, center, settings).map((cell) => cell.coordinate);
  const mutations = createTerrainMutations({ world, operation, center, settings, blockId: input.blockId, zoneId: input.zoneId });
  return mutations.length > 0 ? mutations.map((mutation) => mutation.coordinate) : getTerrainOperationFootprint(center, operation, settings, world.config);
}

/** Number of columns or cells a stroke at `center` affects, for the palette's "Affected" line. */
export function affectedCount(input: PreviewInput) {
  return input.tool === "flatten" ? flattenPreviewCells(input.world, input.center, input.settings).length : previewCells(input).length;
}

/**
 * The top faces of the surface block in a column, slightly lifted, for the
 * surface brush preview: follows slopes and slabs instead of a flat square.
 * Writes into the given arrays; returns false when the column has no surface.
 */
export function appendSurfacePlate(
  world: VoxelWorld,
  x: number,
  z: number,
  fill: number[],
  outline: number[],
): boolean {
  const surface = getTerrainSurfaceAt(world, x, z);
  if (!surface.valid) return false;
  const { x: cx, y: cy, z: cz } = surface.grid;
  const centre = world.gridToWorld(cx, cy, cz);
  const faces = getShapeDefinition(world.getShape(cx, cy, cz)).faces(world.getRotation(cx, cy, cz), world.getState(cx, cy, cz));
  for (const face of faces) {
    if (face.direction !== "py") continue;
    const length = Math.hypot(face.normal[0], face.normal[1], face.normal[2]) || 1;
    const lift = (amount: number, axis: number) => (face.normal[axis] / length) * amount;
    const corner = (index: number, grow: number, amount: number) => {
      const point = face.corners[index];
      return [centre.x + point[0] * grow + lift(amount, 0), centre.y + point[1] * grow + lift(amount, 1), centre.z + point[2] * grow + lift(amount, 2)];
    };
    const corners = face.corners.map((_, index) => corner(index, 1.02, 0.024));
    // Two triangles per quad, as plain triangles: the plates are few and short-lived.
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const point = corners[index % corners.length];
      fill.push(point[0], point[1], point[2]);
    }
    for (let index = 0; index < face.corners.length; index += 1) {
      outline.push(...corner(index, 1.025, 0.03), ...corner((index + 1) % face.corners.length, 1.025, 0.03));
    }
  }
  return true;
}

export const DEFAULT_TOOL_BRUSH: TerrainBrushSettings = { ...DEFAULT_TERRAIN_BRUSH };
